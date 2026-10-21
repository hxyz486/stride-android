package cn.stride.offline;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.BitmapFactory;
import org.json.JSONObject;
import java.io.*;

/** Read-only raster MBTiles, standard Web Mercator / TMS. */
public final class OfflineTiles implements Closeable {
    private SQLiteDatabase db;
    private JSONObject meta;
    private boolean xyz;
    public OfflineTiles(File file) throws Exception {
        try{
            db=SQLiteDatabase.openDatabase(file.getAbsolutePath(),null,SQLiteDatabase.OPEN_READONLY);
            meta=new JSONObject();
            try(Cursor c=db.rawQuery("SELECT name,value FROM metadata",null)){
                while(c.moveToNext())meta.put(c.getString(0),c.getString(1));
            }
            String format=meta.optString("format","").toLowerCase(java.util.Locale.ROOT);
            if(format.equals("pbf")||format.equals("mvt"))throw new IOException("当前支持 PNG/JPEG/WebP 栅格 MBTiles，不支持矢量 PBF");
            try(Cursor c=db.rawQuery("SELECT tile_data FROM tiles LIMIT 1",null)){
                if(!c.moveToFirst())throw new IOException("地图包没有瓦片");
                byte[] bytes=c.getBlob(0);BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;
                BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
                if(opts.outWidth<=0||opts.outHeight<=0)throw new IOException("请导入栅格 MBTiles 地图包");
                if(opts.outWidth>512||opts.outHeight>512)throw new IOException("地图瓦片边长须不超过 512 像素，请重新准备标准栅格地图包");
            }
            xyz="xyz".equals(meta.optString("scheme","tms"));
            meta.put("available",true);meta.put("size",file.length());
        }catch(Exception e){close();throw e;}
    }
    public synchronized JSONObject metadata(){return meta;}
    public synchronized byte[] tile(int z,int x,int y){
        if(db==null||z<0||z>22||x<0||y<0||x>=(1<<z)||y>=(1<<z))return null;
        int row=xyz?y:(1<<z)-1-y;
        try(Cursor c=db.rawQuery("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1",new String[]{""+z,""+x,""+row})){
            if(c.moveToFirst()){byte[] b=c.getBlob(0);if(b.length>4194304)return null;BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(b,0,b.length,o);return o.outWidth>0&&o.outHeight>0&&o.outWidth<=512&&o.outHeight<=512?b:null;}
        }catch(Exception ignored){}return null;
    }
    @Override public synchronized void close(){if(db!=null){db.close();db=null;}}
}
