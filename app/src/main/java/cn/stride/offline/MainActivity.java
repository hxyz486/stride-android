package cn.stride.offline;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.location.Location;
import android.location.LocationListener;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.webkit.*;
import android.view.*;
import android.widget.FrameLayout;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private WebView web;
    private volatile OfflineTiles tiles;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private String pendingConfig,pendingExport;
    private boolean pendingOverlay,startPending,destroyed;
    private MotionMonitor motion;
    private boolean deviceSensors,visible;
    private boolean pendingMapLocation,mapLocationShown,resumeMapLocation;
    private LocationListener mapLocationListener;
    private final Handler mapHandler=new Handler(Looper.getMainLooper());
    private Runnable mapLocationTimeout;
    private static final String ORIGIN="https://app.stride.local";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        motion=new MotionMonitor(this);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        getWindow().setStatusBarColor(Color.rgb(245,244,240));getWindow().setNavigationBarColor(Color.rgb(245,244,240));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(245,244,240));
        web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
        if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{
            android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsets.CONSUMED;
        });
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setDefaultTextEncodingName("UTF-8");settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString()+" Stride/1.3.3 (cn.stride.offline)");
        web.addJavascriptInterface(new Bridge(),"Native");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();
                if(ORIGIN.equals(u.getScheme()+"://"+u.getHost()))return false;
                if(req.isForMainFrame()&&req.hasGesture()&&"https".equals(u.getScheme())&&"www.amap.com".equals(u.getHost())&&("/".equals(u.getPath())||"".equals(u.getPath()))){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,u).addCategory(Intent.CATEGORY_BROWSABLE));}
                    catch(Exception e){event("toast","此设备没有可用的浏览器");}
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();
                // Permit only the selected HTTPS raster endpoint. Returning
                // null leaves HTTP cache control to WebView's normal cache.
                if("https".equals(u.getScheme())&&"webrd01.is.autonavi.com".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&"GET".equals(req.getMethod())&&"/appmaptile".equals(u.getPath()))return null;
                if(!"app.stride.local".equals(u.getHost()))return response("text/plain",new byte[0]);
                String path=u.getPath();
                try{
                    if(path.startsWith("/tiles/")){
                        String[] p=path.split("/");OfflineTiles store=tiles;
                        byte[] bytes=store==null?null:store.tile(Integer.parseInt(p[2]),Integer.parseInt(p[3]),Integer.parseInt(p[4]));
                        if(bytes==null)return new WebResourceResponse("image/png",null,404,"No tile",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                        return response("image/png",bytes);
                    }
                    if(path.equals("/"))path="/index.html";
                    if(path.contains("..")||path.contains("\\"))return response("text/plain",new byte[0]);
                    String mime=path.endsWith(".css")?"text/css":path.endsWith(".js")?"application/javascript":path.endsWith(".json")||path.endsWith(".geojson")?"application/json":path.endsWith(".svg")?"image/svg+xml":"text/html";
                    return new WebResourceResponse(mime,"UTF-8",getAssets().open(path.substring(1)));
                }catch(Exception e){return response("text/plain",new byte[0]);}
            }
        });
        File imported=new File(getFilesDir(),"offline.mbtiles");
        if(imported.exists())try{tiles=new OfflineTiles(imported);}catch(Exception ignored){}
        web.loadUrl(ORIGIN+"/index.html");
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
        String overlayConfig=getIntent().getStringExtra("overlayStart");getIntent().removeExtra("overlayStart");
        if(overlayConfig!=null)web.postDelayed(()->startSimulation(overlayConfig),500);
    }
    private WebResourceResponse response(String type,byte[] bytes){return new WebResourceResponse(type,"UTF-8",new ByteArrayInputStream(bytes));}
    private void event(String type,String value){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.nativeEvent&&window.nativeEvent("+JSONObject.quote(type)+","+JSONObject.quote(value)+")",null);});}
    private void stopMapLocation(){
        if(mapLocationTimeout!=null){mapHandler.removeCallbacks(mapLocationTimeout);mapLocationTimeout=null;}
        LocationListener listener=mapLocationListener;mapLocationListener=null;
        if(listener!=null)try{((LocationManager)getSystemService(LOCATION_SERVICE)).removeUpdates(listener);}catch(Exception ignored){}
    }
    private boolean recentMapLocation(Location location,long maxAgeMs){
        // A previous route playback can still be the provider's last fix.
        // The homepage must center on a measured device location only.
        if(location==null||location.isFromMockProvider()||!Double.isFinite(location.getLatitude())||!Double.isFinite(location.getLongitude())||Math.abs(location.getLatitude())>85.05112878||Math.abs(location.getLongitude())>180)return false;
        if(location.hasAccuracy()&&(!Float.isFinite(location.getAccuracy())||location.getAccuracy()<0))return false;
        long age=(SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos())/1000000L;
        return age>=0&&age<=maxAgeMs;
    }
    private void sendMapLocation(Location location,boolean cached){
        try{JSONObject result=new JSONObject();result.put("lon",location.getLongitude());result.put("lat",location.getLatitude());result.put("accuracy",location.hasAccuracy()?location.getAccuracy():-1);result.put("cached",cached);result.put("mock",location.isFromMockProvider());event("location",result.toString());mapLocationShown=true;}catch(Exception ignored){}
    }
    private void locateMap(boolean interactive){
        if(destroyed||web==null||pendingMapLocation)return;
        if(!visible){resumeMapLocation=true;return;}
        resumeMapLocation=false;
        stopMapLocation();mapLocationShown=false;
        boolean coarse=checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
        boolean fine=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
        if(!coarse&&!fine){
            boolean asked=getSharedPreferences("stride",0).getBoolean("mapLocationAsked",false);
            if(interactive||!asked){pendingMapLocation=true;getSharedPreferences("stride",0).edit().putBoolean("mapLocationAsked",true).apply();requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},14);}
            else event("locationError","未获得定位权限，可在系统应用权限中允许定位；也可以手动选择城市");
            return;
        }
        LocationManager manager=(LocationManager)getSystemService(LOCATION_SERVICE);
        java.util.ArrayList<String> providers=new java.util.ArrayList<>();
        try{if(fine&&manager.isProviderEnabled(LocationManager.GPS_PROVIDER))providers.add(LocationManager.GPS_PROVIDER);if(manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))providers.add(LocationManager.NETWORK_PROVIDER);}catch(Exception ignored){}
        if(providers.isEmpty()){
            boolean enabled=false;
            try{enabled=Build.VERSION.SDK_INT>=28?manager.isLocationEnabled():manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);}catch(Exception ignored){}
            event("locationError",enabled?"当前定位方式暂不可用，可在应用权限中允许精确位置后重试；也可以手动选择城市":"请打开手机的位置信息开关，再点击定位按钮");return;
        }
        Location last=null;
        for(String provider:providers)try{Location candidate=manager.getLastKnownLocation(provider);if(recentMapLocation(candidate,120000)&&(last==null||candidate.getElapsedRealtimeNanos()>last.getElapsedRealtimeNanos()))last=candidate;}catch(Exception ignored){}
        if(last!=null)sendMapLocation(last,true);
        mapLocationListener=new LocationListener(){
            @Override public void onLocationChanged(Location location){if(mapLocationListener!=this||destroyed)return;if(recentMapLocation(location,30000)){sendMapLocation(location,false);stopMapLocation();}}
            @Override public void onStatusChanged(String provider,int status,Bundle extras){}
            @Override public void onProviderEnabled(String provider){}
            @Override public void onProviderDisabled(String provider){}
        };
        boolean requested=false;
        for(String provider:providers)try{manager.requestLocationUpdates(provider,0,0,mapLocationListener,Looper.getMainLooper());requested=true;}catch(Exception ignored){}
        if(!requested){boolean shown=mapLocationShown;stopMapLocation();event("locationError",shown?"当前使用最近定位，暂时无法获取新位置":"暂时无法获取当前位置，可手动选择城市后重试");return;}
        mapLocationTimeout=()->{boolean shown=mapLocationShown;stopMapLocation();event("locationError",shown?"当前使用最近定位，暂未获取到新位置":"暂未获取到当前位置，请到信号较好的地方点击定位重试");};
        mapHandler.postDelayed(mapLocationTimeout,18000);
    }
    private void startSimulation(String config){
        if(startPending)return;
        try{
            JSONObject j=new JSONObject(config);
            if(j.optBoolean("mock",true)){
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
                    pendingConfig=config;requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},11);return;
                }
                AppOpsManager ops=(AppOpsManager)getSystemService(APP_OPS_SERVICE);
                if(ops.checkOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION,android.os.Process.myUid(),getPackageName())!=AppOpsManager.MODE_ALLOWED){
                    event("setup","请在开发者选项 → 选择模拟位置信息应用中，选择“行迹 STRIDE”");return;
                }
                LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
                if(!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)){
                    event("error","请先打开手机的位置信息开关，再开始模拟定位");return;
                }
            }
            if(SimulationService.active!=null){event("error","已有回放正在进行，请先结束当前回放");return;}
            startPending=true;
            startForegroundService(new Intent(this,SimulationService.class).putExtra("config",config));
            web.postDelayed(()->startPending=false,800);
        }catch(Exception e){startPending=false;event("error",e.getMessage()==null?"启动失败":e.getMessage());}
    }
    public final class Bridge {
        @JavascriptInterface public void locate(boolean interactive){runOnUiThread(()->locateMap(interactive));}
        @JavascriptInterface public String sensorState(){return motion.snapshot();}
        @JavascriptInterface public void sensorSettings(){runOnUiThread(()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()))));}
        @JavascriptInterface public void sensorMode(boolean enabled){runOnUiThread(()->{
            deviceSensors=enabled;
            if(enabled&&visible){motion.start();if(Build.VERSION.SDK_INT>=29&&!motion.stepPermission()&&getSharedPreferences("stride",0).getBoolean("motionAsked",false)==false){getSharedPreferences("stride",0).edit().putBoolean("motionAsked",true).apply();requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION},13);}}
            else motion.stop();
        });}
        @JavascriptInterface public String state(){SimulationService s=SimulationService.active;return s==null?SimulationService.lastState:s.snapshot();}
        @JavascriptInterface public String mapInfo(){OfflineTiles t=tiles;return t==null?"{\"available\":false}":t.metadata().toString();}
        @JavascriptInterface public void start(String config){runOnUiThread(()->startSimulation(config));}
        @JavascriptInterface public void toggle(){runOnUiThread(()->{SimulationService s=SimulationService.active;if(s!=null)s.toggle();});}
        @JavascriptInterface public void stop(){runOnUiThread(()->{SimulationService s=SimulationService.active;if(s!=null)s.stop();});}
        @JavascriptInterface public void speed(double value){runOnUiThread(()->{try{SimulationService s=SimulationService.active;if(s!=null)s.setSpeed(value);}catch(Exception e){event("error",e.getMessage());}});}
        @JavascriptInterface public void pace(double value){runOnUiThread(()->{try{SimulationService s=SimulationService.active;if(s!=null)s.pace(value);}catch(Exception e){event("error",e.getMessage());}});}
        @JavascriptInterface public void gyro(boolean enabled){runOnUiThread(()->{SimulationService s=SimulationService.active;if(s!=null)s.gyro(enabled);});}
        @JavascriptInterface public void developerSettings(){runOnUiThread(()->{try{startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));}catch(Exception e){startActivity(new Intent(Settings.ACTION_SETTINGS));}});}
        @JavascriptInterface public void notifications(){runOnUiThread(()->{if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},12);else event("toast","回放通知已允许，可在通知栏控制回放");});}
        @JavascriptInterface public void importMap(){runOnUiThread(()->{
            Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(i,21);
        });}
        @JavascriptInterface public String overlayState(){try{return new JSONObject().put("enabled",OverlayService.active!=null).put("permission",Settings.canDrawOverlays(MainActivity.this)).put("error",OverlayService.lastError).toString();}catch(Exception e){return "{}";}}
        @JavascriptInterface public void updateOverlayConfig(String config){getSharedPreferences("stride",0).edit().putString("overlayConfig",config).apply();}
        @JavascriptInterface public void overlay(boolean enabled,String config){runOnUiThread(()->{
            if(!enabled){pendingOverlay=false;getSharedPreferences("stride",0).edit().putBoolean("overlayEnabled",false).apply();stopService(new Intent(MainActivity.this,OverlayService.class));event("overlay","false");return;}
            getSharedPreferences("stride",0).edit().putString("overlayConfig",config).apply();
            if(!Settings.canDrawOverlays(MainActivity.this)){
                pendingOverlay=true;
                try{startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));}
                catch(Exception e){pendingOverlay=false;event("error","此设备无法打开悬浮窗权限设置");}return;
            }
            enableOverlay();
        });}
        @JavascriptInterface public void export(String routeFallback){runOnUiThread(()->{
            pendingExport=routeFallback;
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"stride-session-"+System.currentTimeMillis()+".json"),22);
        });}
    }
    private void enableOverlay(){
        try{getSharedPreferences("stride",0).edit().putBoolean("overlayEnabled",true).apply();startForegroundService(new Intent(this,OverlayService.class));}
        catch(Exception e){event("error","悬浮窗启动失败："+e.getMessage());}
    }
    @Override protected void onResume(){super.onResume();visible=true;if(deviceSensors)motion.start();OverlayService.appVisible=true;if(OverlayService.active!=null)OverlayService.active.visibility(false);
        if(pendingOverlay){pendingOverlay=false;if(Settings.canDrawOverlays(this))enableOverlay();else event("error","尚未允许悬浮窗权限，可稍后在运动数据页面重新开启");}
        else if(OverlayService.active==null && Settings.canDrawOverlays(this) && getSharedPreferences("stride",0).getBoolean("overlayEnabled",false))enableOverlay();
        if(resumeMapLocation&&!pendingMapLocation)locateMap(false);
    }
    @Override protected void onPause(){visible=false;motion.stop();super.onPause();}
    @Override protected void onStop(){super.onStop();if(mapLocationListener!=null){resumeMapLocation=true;stopMapLocation();}OverlayService.appVisible=false;if(OverlayService.active!=null)OverlayService.active.visibility(true);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);String config=intent.getStringExtra("overlayStart");intent.removeExtra("overlayStart");if(config!=null)startSimulation(config);}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==11){String config=pendingConfig;pendingConfig=null;
            if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&config!=null)startSimulation(config);
            else event("error","系统模拟定位需要“精确位置”权限，可在应用设置中开启；也可切换到 App 内预览");
        }
        if(code==12)event("toast",Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED?"回放通知已允许":"未允许通知，仍可在 App 内控制回放；也可在应用设置中开启通知");
        if(code==13){if(deviceSensors&&visible)motion.start();if(!motion.stepPermission())event("toast","未允许身体活动权限，仍可读取陀螺仪；实测步数不可用");}
        if(code==14){pendingMapLocation=false;if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)locateMap(false);else event("locationError","未获得定位权限，可在系统应用权限中允许定位；也可以手动选择城市");}
    }
    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);
        if(result!=RESULT_OK||data==null||data.getData()==null){if(code==22)pendingExport=null;event("toast",code==21?"已取消地图导入":"已取消导出");return;}
        Uri uri=data.getData();
        if(code==22){final String output=pendingExport;pendingExport=null;worker.execute(()->{
            try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){SimulationService s=SimulationService.active;String json=s!=null?s.exportJson():SimulationService.exportLast(output);if(out==null||json==null)throw new IOException("无法打开导出文件");out.write(json.getBytes(StandardCharsets.UTF_8));event("toast","已导出路线与模拟运动数据");}
            catch(Exception e){event("error","导出失败："+e.getMessage());}
        });}
        if(code==21){event("toast","正在检查并导入地图包…");worker.execute(()->{
            File temp=new File(getFilesDir(),"importing.mbtiles");
            File target=new File(getFilesDir(),"offline.mbtiles"),backup=new File(getFilesDir(),"offline.previous.mbtiles");
            boolean backedUp=false;
            try{
                try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(temp)){
                    byte[] buffer=new byte[65536];long count=0;int n;
                    while((n=in.read(buffer))!=-1){count+=n;if(count>2147483648L)throw new IOException("地图包须小于 2GB，建议按城市拆分");out.write(buffer,0,n);}
                }
                JSONObject meta;try(OfflineTiles check=new OfflineTiles(temp)){meta=check.metadata();}
                if(target.exists()){java.nio.file.Files.move(target.toPath(),backup.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);backedUp=true;}
                java.nio.file.Files.move(temp.toPath(),target.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                OfflineTiles replacement=new OfflineTiles(target),old=tiles;
                if(destroyed)replacement.close();else tiles=replacement;
                if(old!=null)old.close();backup.delete();event("map",meta.toString());
            }catch(Exception e){temp.delete();if(backedUp)try{java.nio.file.Files.move(backup.toPath(),target.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}catch(Exception ignored){}event("error","地图导入失败，原地图已保留："+e.getMessage());}
        });}
    }
    private void handleBack(){if(web!=null)web.evaluateJavascript("window.handleBack&&window.handleBack()",v->{if(!"true".equals(v))moveTaskToBack(true);});}
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onDestroy(){destroyed=true;stopMapLocation();motion.stop();if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}worker.shutdown();OfflineTiles t=tiles;if(t!=null)t.close();super.onDestroy();}
}
