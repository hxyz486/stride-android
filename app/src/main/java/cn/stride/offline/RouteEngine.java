package cn.stride.offline;

import java.util.ArrayList;
import java.util.List;

/** Pure Java: WGS84 meters, configured pace in min/km, gyro in rad/s. */
public final class RouteEngine {
    public static final double EARTH = 6371008.8;
    public static final class Point {
        public final double lat, lon;
        public Point(double lat, double lon) {
            if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180)
                throw new IllegalArgumentException("坐标超出范围");
            this.lat=lat; this.lon=lon;
        }
    }
    public final List<Point> points = new ArrayList<>();
    private double[] cumulative;
    public double total, distance, elapsed, pace=180, steps, amplitude=1;
    public boolean running, finished, gyroEnabled=true;
    private double lastBearing, yawRate, minutesPerKilometer=3;
    public synchronized void load(List<Point> route) {
        if (route == null || route.size() < 2 || route.size()>10000) throw new IllegalArgumentException("路线需要 2–10000 个点");
        List<Point> clean=new ArrayList<>();
        for(Point p:route) if(clean.isEmpty() || meters(clean.get(clean.size()-1),p)>.05) clean.add(p);
        if(clean.size()<2) throw new IllegalArgumentException("请绘制一条有长度的路线");
        double[] next=new double[clean.size()];
        for(int i=1;i<clean.size();i++) next[i]=next[i-1]+meters(clean.get(i-1),clean.get(i));
        if(next[next.length-1] < 1 || next[next.length-1]>1000000) throw new IllegalArgumentException("路线长度须在 1 米至 1000 公里之间");
        points.clear(); points.addAll(clean); cumulative=next; total=next[next.length-1]; reset();
    }
    public synchronized void setPace(double value) {
        setSpeed(value/60);
    }
    public synchronized void setSpeed(double value) {
        if(!Double.isFinite(value) || value<0 || value>5 || (value>0 && value<.1)) throw new IllegalArgumentException("配速须为 0–5 分钟/公里，最小非零值为 0.1；0 表示停留");
        minutesPerKilometer=value;
        pace=value*60;
        if(value==0)yawRate=0;
    }
    public synchronized void start() { if(points.size()<2) throw new IllegalStateException("请先绘制路线"); if(finished) reset(); running=true; }
    public synchronized void pause() { running=false; yawRate=0; }
    public synchronized void reset() { running=false; finished=false; distance=elapsed=steps=yawRate=0; lastBearing=bearing(); }
    public synchronized void tick(double seconds) {
        if(!running || !Double.isFinite(seconds) || seconds<=0) return;
        double velocity=metersPerSecond();
        if(velocity==0){elapsed=Math.min(Double.MAX_VALUE,elapsed+seconds);yawRate=0;return;}
        double used=Math.min(seconds,(total-distance)/velocity);
        elapsed=Math.min(Double.MAX_VALUE,elapsed+used); distance=Math.min(total,distance+velocity*used); steps+=cadence()*used/60;
        double nextBearing=bearing();
        double turn=((nextBearing-lastBearing+540)%360)-180;
        yawRate=Math.max(-1.5,Math.min(1.5,Math.toRadians(turn)/Math.max(.1,used)));
        lastBearing=nextBearing;
        if(distance>=total-1e-7){ distance=total; finished=true; running=false; yawRate=0; }
    }
    public synchronized Point position() {
        if(points.isEmpty()) return new Point(40.015,116.39);
        int i=segment(); if(i>=points.size()-1) return points.get(points.size()-1);
        double f=(distance-cumulative[i])/(cumulative[i+1]-cumulative[i]);
        Point a=points.get(i),b=points.get(i+1);
        double lonDelta=((b.lon-a.lon+540)%360)-180;
        double lon=((a.lon+lonDelta*f+540)%360)-180;
        return new Point(a.lat+(b.lat-a.lat)*f,lon);
    }
    private int segment() {
        if(cumulative==null) return 0;
        int lo=0,hi=cumulative.length-1;
        while(lo<hi){int mid=(lo+hi+1)/2;if(cumulative[mid]<=distance)lo=mid;else hi=mid-1;}
        return lo;
    }
    public synchronized double bearing() {
        if(points.size()<2) return 0;
        int i=Math.min(segment(),points.size()-2);
        Point a=points.get(i),b=points.get(i+1);
        double a1=Math.toRadians(a.lat),a2=Math.toRadians(b.lat),d=Math.toRadians(b.lon-a.lon);
        return (Math.toDegrees(Math.atan2(Math.sin(d)*Math.cos(a2),Math.cos(a1)*Math.sin(a2)-Math.sin(a1)*Math.cos(a2)*Math.cos(d)))+360)%360;
    }
    public synchronized double[] gyro() {
        if(!running || !gyroEnabled || speed()==0) return new double[]{0,0,0};
        double frequency=cadence()/60;
        double phase=(elapsed%(1/frequency))*frequency*2*Math.PI;
        return new double[]{amplitude*(.22*Math.sin(phase)+.035*Math.sin(phase*2+.6)),
            amplitude*(.16*Math.cos(phase*.5)+.025*Math.sin(phase*2)),
            amplitude*(.11*Math.sin(phase+.9)+.018*Math.cos(phase*.5))+yawRate};
    }
    public synchronized double speed(){return minutesPerKilometer;}
    public synchronized double metersPerSecond(){return minutesPerKilometer>0?1000/(minutesPerKilometer*60):0;}
    public synchronized double cadence(){return Math.min(210,60*metersPerSecond());}
    public static double meters(Point a,Point b){
        double d1=Math.toRadians(b.lat-a.lat),d2=Math.toRadians(b.lon-a.lon);
        double h=Math.sin(d1/2)*Math.sin(d1/2)+Math.cos(Math.toRadians(a.lat))*Math.cos(Math.toRadians(b.lat))*Math.sin(d2/2)*Math.sin(d2/2);
        return 2*EARTH*Math.asin(Math.sqrt(Math.min(1,h)));
    }
}
