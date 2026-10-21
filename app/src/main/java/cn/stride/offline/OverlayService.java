package cn.stride.offline;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.location.LocationManager;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import org.json.*;

/** User-granted overlay; never hooks other applications or sensor services. */
public final class OverlayService extends Service {
    public static volatile OverlayService active;
    public static volatile boolean appVisible=true;
    private WindowManager windows;
    private LinearLayout panel;
    private TextView status,button;
    private WindowManager.LayoutParams params;
    private boolean attached;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private int dp(float n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
    private GradientDrawable background(int fill,int stroke,int radius){GradientDrawable d=new GradientDrawable();d.setColor(fill);d.setCornerRadius(dp(radius));if(stroke!=0)d.setStroke(dp(1),stroke);return d;}
    private TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextColor(color);v.setTextSize(size);v.setGravity(Gravity.CENTER_VERTICAL);v.setFontFeatureSettings("tnum");return v;}
    @Override public void onCreate(){super.onCreate();active=this;
        if(!Settings.canDrawOverlays(this)){stopSelf();return;}
        windows=(WindowManager)getSystemService(WINDOW_SERVICE);
        panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(12),dp(8),dp(12),dp(12));
        panel.setBackground(background(Color.rgb(248,248,245),Color.rgb(200,200,196),16));panel.setElevation(dp(10));
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=text("STRIDE 行迹",11,Color.BLACK);title.setTypeface(null,Typeface.BOLD);header.addView(title,new LinearLayout.LayoutParams(0,dp(26),1));
        TextView close=text("×",22,Color.GRAY);close.setGravity(Gravity.CENTER);close.setContentDescription("关闭悬浮窗，保留当前回放");header.addView(close,new LinearLayout.LayoutParams(dp(28),dp(28)));close.setOnClickListener(v->stopSelf());panel.addView(header);
        status=text("准备就绪",10,Color.GRAY);panel.addView(status,new LinearLayout.LayoutParams(-1,dp(29)));
        LinearLayout controls=new LinearLayout(this);
        button=text("▶  开始",12,Color.WHITE);button.setGravity(Gravity.CENTER);button.setBackground(background(Color.rgb(28,28,28),0,8));
        controls.addView(button,new LinearLayout.LayoutParams(0,dp(39),1));button.setOnClickListener(v->toggle());
        TextView open=text("↗",22,Color.BLACK);open.setGravity(Gravity.CENTER);open.setContentDescription("返回行迹应用");LinearLayout.LayoutParams openLayout=new LinearLayout.LayoutParams(dp(35),dp(39));openLayout.leftMargin=dp(6);controls.addView(open,openLayout);open.setOnClickListener(v->openApp(null));panel.addView(controls);
        params=new WindowManager.LayoutParams(dp(183),-2,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,android.graphics.PixelFormat.TRANSLUCENT);
        params.gravity=Gravity.TOP|Gravity.LEFT;params.x=dp(16);params.y=dp(230);
        title.setOnTouchListener(new View.OnTouchListener(){float downX,downY;int x,y;public boolean onTouch(View v,android.view.MotionEvent e){
            if(e.getAction()==android.view.MotionEvent.ACTION_DOWN){downX=e.getRawX();downY=e.getRawY();x=params.x;y=params.y;return true;}
            if(e.getAction()==android.view.MotionEvent.ACTION_MOVE){params.x=Math.max(0,Math.min(getResources().getDisplayMetrics().widthPixels-dp(183),x+(int)(e.getRawX()-downX)));params.y=Math.max(0,Math.min(getResources().getDisplayMetrics().heightPixels-dp(125),y+(int)(e.getRawY()-downY)));if(attached)windows.updateViewLayout(panel,params);return true;}return true;
        }});
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);manager.createNotificationChannel(new NotificationChannel("overlay","悬浮控制",NotificationManager.IMPORTANCE_LOW));
        PendingIntent openIntent=PendingIntent.getActivity(this,10,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent closeIntent=PendingIntent.getService(this,11,new Intent(this,OverlayService.class).setAction("close"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification n=new Notification.Builder(this,"overlay").setSmallIcon(R.drawable.ic_stride).setContentTitle("行迹悬浮控制已开启").setContentText("返回桌面后可开始、暂停或继续轨迹回放").setContentIntent(openIntent).setOngoing(true).addAction(0,"关闭悬浮窗",closeIntent).build();
        if(Build.VERSION.SDK_INT>=34)startForeground(2,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(2,n);
        visibility(!appVisible);handler.post(refresh);
    }
    private final Runnable refresh=new Runnable(){public void run(){
        if(panel==null)return;
        try{JSONObject s=new JSONObject(SimulationService.active==null?SimulationService.lastState:SimulationService.active.snapshot());String mode=s.optString("status","idle");boolean running=mode.equals("running"),paused=mode.equals("paused");
            button.setText(running?"Ⅱ  暂停":paused?"▶  继续":"▶  开始");
            status.setText(running||paused?String.format(java.util.Locale.ROOT,"%s  ·  %.2f km",running?"回放中":"已暂停",s.optDouble("distance")/1000):mode.equals("finished")?"已抵达终点":"准备就绪");
        }catch(Exception ignored){}handler.postDelayed(this,500);
    }};
    private void toggle(){
        SimulationService s=SimulationService.active;if(s!=null){s.toggle();return;}
        String config=getSharedPreferences("stride",0).getString("overlayConfig","");
        try{
            JSONObject c=new JSONObject(config);if(c.getJSONArray("route").length()<2)throw new IllegalArgumentException("请先在 App 内绘制路线");
            boolean needsUi=false;
            if(c.optBoolean("mock",true)){
                AppOpsManager ops=(AppOpsManager)getSystemService(APP_OPS_SERVICE);
                LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
                needsUi=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED||ops.checkOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION,android.os.Process.myUid(),getPackageName())!=AppOpsManager.MODE_ALLOWED||!lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
            }
            if(needsUi){openApp(config);return;}
            try{startForegroundService(new Intent(this,SimulationService.class).putExtra("config",config));}
            catch(Exception e){openApp(config);}
        }catch(Exception e){Toast.makeText(this,e.getMessage()==null?"请先在 App 内配置路线":e.getMessage(),Toast.LENGTH_LONG).show();openApp(null);}
    }
    private void openApp(String config){Intent i=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);if(config!=null)i.putExtra("overlayStart",config);startActivity(i);}
    public void visibility(boolean visible){
        if(panel==null||windows==null)return;
        try{if(visible&&!attached){windows.addView(panel,params);attached=true;}else if(!visible&&attached){windows.removeView(panel);attached=false;}}catch(Exception e){stopSelf();}
    }
    @Override public int onStartCommand(Intent i,int flags,int id){if(i!=null&&"close".equals(i.getAction()))stopSelf();return START_NOT_STICKY;}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(attached&&windows!=null)windows.removeView(panel);attached=false;panel=null;if(active==this)active=null;stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}
