package cn.stride.offline;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.os.Build;
import android.os.SystemClock;
import org.json.*;
import java.util.ArrayDeque;

/** Foreground, read-only hardware diagnostics. Never injects or exports system sensor events. */
public final class MotionMonitor implements SensorEventListener {
    private final Context context;
    private final SensorManager manager;
    private final Sensor gyro,step;
    private boolean listening,gyroRegistered,stepRegistered;
    private final double[] values={0,0,0};
    private long lastGyro,lastStep;
    private long steps;
    private final ArrayDeque<Long> recentSteps=new ArrayDeque<>();
    public MotionMonitor(Context context){
        this.context=context;
        manager=(SensorManager)context.getSystemService(Context.SENSOR_SERVICE);
        gyro=manager==null?null:manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        step=manager==null?null:manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
    }
    public boolean stepPermission(){return Build.VERSION.SDK_INT<29||context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION)==PackageManager.PERMISSION_GRANTED;}
    public synchronized void start(){
        stop();listening=true;
        if(manager==null)return;
        if(gyro!=null)gyroRegistered=manager.registerListener(this,gyro,SensorManager.SENSOR_DELAY_GAME);
        if(step!=null&&stepPermission())try{stepRegistered=manager.registerListener(this,step,SensorManager.SENSOR_DELAY_NORMAL);}catch(SecurityException ignored){}
    }
    public synchronized void stop(){if(manager!=null)manager.unregisterListener(this);listening=false;gyroRegistered=stepRegistered=false;lastGyro=0;for(int i=0;i<3;i++)values[i]=0;}
    @Override public synchronized void onSensorChanged(SensorEvent e){
        if(!listening)return;
        if(e.sensor.getType()==Sensor.TYPE_GYROSCOPE){for(int i=0;i<3;i++)values[i]=Double.isFinite(e.values[i])?e.values[i]:0;lastGyro=SystemClock.elapsedRealtime();}
        else if(e.sensor.getType()==Sensor.TYPE_STEP_DETECTOR&&e.values[0]>=1){long now=SystemClock.elapsedRealtime();steps++;lastStep=now;recentSteps.addLast(now);while(!recentSteps.isEmpty()&&now-recentSteps.peekFirst()>15000)recentSteps.removeFirst();}
    }
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    public synchronized String snapshot(){
        try{
            long now=SystemClock.elapsedRealtime();
            double cadence=recentSteps.size()>1&&now-lastStep<5000?60000.0*(recentSteps.size()-1)/Math.max(1,recentSteps.peekLast()-recentSteps.peekFirst()):0;
            JSONObject j=new JSONObject();j.put("source","device");j.put("listening",listening);
            j.put("gyroAvailable",gyro!=null);j.put("gyroName",gyro==null?"设备未提供陀螺仪":gyro.getName());
            j.put("gyroFresh",gyroRegistered&&lastGyro>0&&now-lastGyro<2000);j.put("gyro",new JSONArray(values));
            j.put("stepAvailable",step!=null);j.put("stepPermission",stepPermission());j.put("stepRegistered",stepRegistered);j.put("steps",steps);j.put("cadence",cadence);
            return j.toString();
        }catch(JSONException e){return "{}";}
    }
}
