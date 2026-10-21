import cn.stride.offline.RouteEngine;
import java.util.Arrays;

public final class RouteEngineTest {
    static int checks;
    static void check(boolean condition,String message){checks++;if(!condition)throw new AssertionError(message);}
    static void near(double actual,double expected,double tolerance,String message){check(Math.abs(actual-expected)<=tolerance,message+": "+actual+" != "+expected);}
    static RouteEngine route(){RouteEngine e=new RouteEngine();e.load(Arrays.asList(new RouteEngine.Point(0,0),new RouteEngine.Point(0,1000/RouteEngine.EARTH*180/Math.PI)));return e;}
    static void finiteState(RouteEngine e){
        RouteEngine.Point p=e.position();
        for(double value:new double[]{e.speed(),e.metersPerSecond(),e.pace,e.distance,e.elapsed,e.steps,e.cadence(),p.lat,p.lon,e.bearing()})
            check(Double.isFinite(value),"state remains valid for JSON numbers");
        for(double value:e.gyro())check(Double.isFinite(value),"gyro remains valid for JSON numbers");
    }
    public static void main(String[] args){
        RouteEngine e=route();near(e.total,1000,.0001,"Haversine meters");
        near(e.speed(),3,0,"default speed is 3 km/min");near(e.metersPerSecond(),50,0,"3 km/min converts to 50 m/s");near(e.pace,20,0,"default legacy pace is 20 seconds/km");
        for(double speed:new double[]{3,5}){e=route();e.setSpeed(speed);e.start();double duration=60/speed;e.tick(duration/2);near(e.distance,500,.001,"halfway at selected km/min speed");near(e.position().lon,e.points.get(1).lon/2,.000001,"speed interpolated position");e.tick(duration/2+100);check(e.finished&&!e.running,"speed completion stops playback");near(e.elapsed,duration,.0001,"speed finish time caps overshoot");near(e.distance,1000,.0001,"speed finish distance exact");finiteState(e);}
        e=route();e.setSpeed(5);near(e.metersPerSecond(),5000.0/60,.00000001,"maximum converts to Android m/s");
        e=route();e.setSpeed(0);e.start();e.tick(30);near(e.distance,0,0,"zero speed holds route position");near(e.elapsed,30,0,"zero speed keeps active clock");near(e.steps,0,0,"zero speed adds no steps");near(e.cadence(),0,0,"zero speed has zero cadence");near(e.pace,0,0,"zero speed uses finite pace sentinel");check(e.running&&!e.finished,"zero speed remains resumable");for(double value:e.gyro())near(value,0,0,"zero speed has no synthetic gyro motion");finiteState(e);
        e.setSpeed(3);e.tick(2);near(e.distance,100,.0001,"positive speed resumes from stationary position");double stationaryDistance=e.distance,stationarySteps=e.steps;e.setSpeed(0);for(double value:e.gyro())near(value,0,0,"switching to zero immediately stops gyro");e.tick(9);near(e.distance,stationaryDistance,0,"switching to zero holds distance");near(e.steps,stationarySteps,0,"switching to zero holds steps");e.pause();double stationaryElapsed=e.elapsed;e.tick(60);near(e.elapsed,stationaryElapsed,0,"pause also freezes stationary clock");
        e=route();e.start();e.tick(2);e.setSpeed(5);e.tick(3);near(e.distance,350,.0001,"speed change applies to future motion");e.setSpeed(0);e.tick(9);e.setSpeed(3);e.tick(3);near(e.distance,500,.0001,"zero and positive speed changes preserve progress");e.tick(100);near(e.elapsed,27,.0001,"completion accounts for stationary active time");check(e.finished&&!e.running,"changed speed completes route");
        for(double pace:new double[]{230,290,360}){e=route();e.setPace(pace);e.start();e.tick(pace/2);near(e.distance,500,.001,"halfway at selected pace");near(e.position().lon,e.points.get(1).lon/2,.000001,"interpolated position");e.tick(pace/2+100);check(e.finished&&!e.running,"completion stops playback");near(e.elapsed,pace,.0001,"finish time caps overshoot");near(e.distance,1000,.0001,"finish distance exact");}
        e=route();e.start();e.tick(10);double before=e.distance,elapsed=e.elapsed;e.pause();e.tick(60);near(e.distance,before,0,"pause retains distance");near(e.elapsed,elapsed,0,"pause retains clock");near(e.gyro()[0],0,0,"pause zeros gyro");e.start();e.tick(10);check(e.distance>before,"resume advances");
        e=route();e.start();e.tick(10);e.setPace(230);e.tick(23);near(e.distance,600,.0001,"legacy pace change applies to future motion");
        e=route();e.start();e.tick(.137);double[] g=e.gyro();check(Double.isFinite(g[0])&&Double.isFinite(g[1])&&Double.isFinite(g[2]),"finite gyro");check(Math.abs(g[0])+Math.abs(g[1])+Math.abs(g[2])>0,"nonzero step gyro");e.gyroEnabled=false;near(e.gyro()[0],0,0,"gyro disabled");
        e=route();for(double invalid:new double[]{229,361,Double.NaN,Double.POSITIVE_INFINITY}){boolean threw=false;try{e.setPace(invalid);}catch(IllegalArgumentException x){threw=true;}check(threw,"reject invalid pace");}
        e=route();for(double invalid:new double[]{-.01,5.01,Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}){boolean threw=false;try{e.setSpeed(invalid);}catch(IllegalArgumentException x){threw=true;}check(threw,"reject invalid speed");}
        e=route();e.setSpeed(0);e.start();e.tick(Double.MAX_VALUE);e.tick(Double.MAX_VALUE);finiteState(e);e.setSpeed(Double.MIN_VALUE);e.tick(1);finiteState(e);e.setSpeed(5);finiteState(e);
        boolean threw=false;try{new RouteEngine.Point(90,0);}catch(IllegalArgumentException x){threw=true;}check(threw,"reject out of Mercator bounds");
        e=new RouteEngine();e.load(Arrays.asList(new RouteEngine.Point(0,0),new RouteEngine.Point(0,0),new RouteEngine.Point(0,.01),new RouteEngine.Point(.01,.01)));check(e.points.size()==3,"remove duplicate vertices");e.start();e.tick(350);check(Double.isFinite(e.position().lat),"multi-segment interpolation");
        e=route();e.start();e.tick(10000);e.start();near(e.distance,0,0,"replay resets completed route");check(e.running,"replay starts");
        e=route();e.start();e.tick(Double.NaN);e.tick(-3);near(e.distance,0,0,"reject invalid tick intervals");
        System.out.println("PASS: "+checks+" RouteEngine checks");
    }
}
