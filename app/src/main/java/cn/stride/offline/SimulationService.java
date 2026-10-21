package cn.stride.offline;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import org.json.*;
import java.util.*;

public final class SimulationService extends Service {
    public static volatile SimulationService active;
    private static final String IDLE_STATE="{\"status\":\"idle\",\"speed\":3,\"speedUnit\":\"km/min\"}";
    public static volatile String lastState=IDLE_STATE;
    private static volatile JSONObject lastSession;
    private final RouteEngine engine=new RouteEngine();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<String> providers=new ArrayList<>();
    private static final int SAMPLE_LIMIT=7200;
    private final ArrayDeque<JSONObject> samples=new ArrayDeque<>();
    private int droppedSamples;
    private LocationManager locations;
    private boolean mock,closed,initialized,ready;
    private long previous,lastSample;
    private String error="";
    private final Runnable ticker=new Runnable(){ public void run(){
        synchronized(SimulationService.this){
            if(closed)return;
            long now=SystemClock.elapsedRealtime();
            engine.tick((now-previous)/1000.0); previous=now;
            try { if(mock && engine.running) publishLocation(); }
            catch(Exception e){ fail("模拟定位中断："+friendly(e));return; }
            if(now-lastSample>=1000){record();lastSample=now;}
            lastState=snapshot();
            if(engine.finished){
                try { if(mock) publishLocation(); }catch(Exception ignored){}
                record();lastState=snapshot();release();stopSelf();return;
            }
            handler.postDelayed(this,100);
        }
    }};
    @Override public void onCreate(){ super.onCreate();active=this;locations=(LocationManager)getSystemService(LOCATION_SERVICE);
        NotificationChannel ch=new NotificationChannel("simulation","轨迹模拟",NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("正在运行的轨迹与模拟定位");((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }
    @Override public synchronized int onStartCommand(Intent intent,int flags,int id){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        String action=intent.getAction();
        if("stop".equals(action)){stop();return START_NOT_STICKY;}
        if("toggle".equals(action)){toggle();return START_NOT_STICKY;}
        if(initialized)return START_NOT_STICKY;
        initialized=true;
        try{
            JSONObject config=new JSONObject(intent.getStringExtra("config"));
            mock=config.optBoolean("mock",true);
            JSONArray route=config.getJSONArray("route");List<RouteEngine.Point> points=new ArrayList<>();
            for(int i=0;i<route.length();i++){JSONArray p=route.getJSONArray(i);points.add(new RouteEngine.Point(p.getDouble(1),p.getDouble(0)));}
            engine.load(points);
            if(config.has("speed"))engine.setSpeed(config.getDouble("speed"));
            else if(config.has("pace"))engine.setPace(config.getDouble("pace"));
            else engine.setSpeed(3);
            engine.gyroEnabled=config.optBoolean("gyro",true);
            samples.clear();droppedSamples=0;error="";lastSession=null;
            Notification notification=notification();
            if(Build.VERSION.SDK_INT>=34)startForeground(1,notification,mock?ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION:ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1,notification);
            if(mock) prepareProviders();
            engine.start();ready=true;closed=false;previous=SystemClock.elapsedRealtime();lastSample=0;
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(1,notification());
            if(mock)publishLocation();lastState=snapshot();
            handler.removeCallbacks(ticker);handler.post(ticker);
        }catch(Exception e){fail(friendly(e));}
        return START_NOT_STICKY;
    }
    private void prepareProviders(){
        for(String name:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
            locations.addTestProvider(name,false,false,false,false,true,true,true,Criteria.POWER_LOW,Criteria.ACCURACY_FINE);
            providers.add(name);locations.setTestProviderEnabled(name,true);
        }
    }
    private void publishLocation(){
        RouteEngine.Point p=engine.position();
        for(String provider:providers){
            Location l=new Location(provider);l.setLatitude(p.lat);l.setLongitude(p.lon);l.setAccuracy(3f);
            l.setAltitude(0);l.setSpeed(engine.running?(float)engine.metersPerSecond():0);l.setBearing((float)engine.bearing());
            l.setTime(System.currentTimeMillis());l.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
            l.setVerticalAccuracyMeters(10);l.setSpeedAccuracyMetersPerSecond(.15f);l.setBearingAccuracyDegrees(5);
            locations.setTestProviderLocation(provider,l);
        }
    }
    public synchronized void toggle(){
        if(!ready||closed)return;
        if(engine.running)engine.pause();else if(!engine.finished)engine.start();
        previous=SystemClock.elapsedRealtime();
        try{if(mock)publishLocation();}catch(Exception e){fail(friendly(e));return;}
        lastState=snapshot();((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(1,notification());
    }
    public synchronized void pace(double seconds){ engine.setPace(seconds);lastState=snapshot(); }
    public synchronized void setSpeed(double kilometersPerMinute){engine.setSpeed(kilometersPerMinute);lastState=snapshot();}
    public synchronized void gyro(boolean enabled){engine.gyroEnabled=enabled;lastState=snapshot();}
    public synchronized void stop(){engine.pause();record();release();lastState=IDLE_STATE;stopSelf();}
    private void fail(String message){error=message;engine.pause();lastState=snapshot();release();stopSelf();}
    public synchronized String snapshot(){
        try{
            JSONObject s=new JSONObject();RouteEngine.Point p=engine.position();double[] g=engine.gyro();
            s.put("status",!error.isEmpty()?"error":!ready?"starting":engine.finished?"finished":engine.running?"running":"paused");
            s.put("error",error);s.put("mock",mock);s.put("distance",engine.distance);s.put("total",engine.total);
            s.put("elapsed",engine.elapsed);s.put("steps",(int)engine.steps);s.put("speed",engine.speed());s.put("speedUnit","km/min");s.put("pace",engine.pace);
            s.put("lat",p.lat);s.put("lon",p.lon);s.put("bearing",engine.bearing());
            s.put("gyro",new JSONArray(g));s.put("gyroEnabled",engine.gyroEnabled);s.put("cadence",engine.cadence());s.put("sampleCount",samples.size());return s.toString();
        }catch(JSONException e){return "{\"status\":\"error\",\"error\":\"状态生成失败\"}";}
    }
    private void record(){
        if(samples.size()>=SAMPLE_LIMIT){samples.removeFirst();droppedSamples++;}
        try{JSONObject s=new JSONObject(snapshot());s.remove("speedUnit");s.put("timestamp",System.currentTimeMillis());samples.addLast(s);}catch(Exception ignored){}
    }
    private synchronized JSONObject sessionObject(){
        try{
            JSONObject j=new JSONObject();j.put("format","stride-session-v1");j.put("coordinates","WGS84");
            j.put("speedUnit","km/min");
            j.put("sensorSource","synthetic; app-local only; rad/s");j.put("systemMockLocation",mock);
            j.put("sampleIntervalSeconds",1);j.put("sampleLimit",SAMPLE_LIMIT);j.put("droppedSamples",droppedSamples);
            JSONArray route=new JSONArray();for(RouteEngine.Point p:engine.points)route.put(new JSONArray(new double[]{p.lon,p.lat}));
            j.put("route",route);j.put("samples",new JSONArray(samples));j.put("state",new JSONObject(snapshot()));return j;
        }catch(Exception e){return new JSONObject();}
    }
    public String exportJson(){try{return sessionObject().toString(2);}catch(Exception e){return "{}";}}
    public static String exportLast(String fallback){JSONObject j=lastSession;try{return j==null?fallback:j.toString(2);}catch(Exception e){return fallback;}}
    private Notification notification(){
        int flags=PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),flags);
        PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,SimulationService.class).setAction("toggle"),flags);
        PendingIntent stop=PendingIntent.getService(this,2,new Intent(this,SimulationService.class).setAction("stop"),flags);
        return new Notification.Builder(this,"simulation").setSmallIcon(cn.stride.offline.R.drawable.ic_stride)
            .setContentTitle("行迹 · "+(engine.running?"轨迹回放中":"轨迹已暂停"))
            .setContentText(mock?"系统模拟定位已启用 · 点击返回控制":"离线轨迹与模拟运动数据")
            .setContentIntent(open).setOngoing(true).addAction(0,engine.running?"暂停":"继续",pause).addAction(0,"结束",stop).build();
    }
    private void release(){
        closed=true;handler.removeCallbacks(ticker);lastSession=sessionObject();
        for(String p:providers)try{locations.removeTestProvider(p);}catch(Exception ignored){}
        providers.clear();stopForeground(STOP_FOREGROUND_REMOVE);
    }
    private String friendly(Exception e){
        if(e instanceof SecurityException)return "请授予精确位置权限，并在开发者选项中将“模拟位置信息应用”设为行迹";
        return e.getMessage()==null?e.getClass().getSimpleName():e.getMessage();
    }
    @Override public synchronized void onDestroy(){if(!closed){engine.pause();error="后台回放已中断，请重新开始";lastState=snapshot();release();}if(active==this)active=null;super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}
