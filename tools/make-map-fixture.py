"""Create an original, clearly marked one-tile MBTiles fixture for import checks."""
import base64, math, pathlib, sqlite3
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'build/stride-test.mbtiles'
out.parent.mkdir(exist_ok=True)
if out.exists():out.unlink()
lon,lat,z=116.39,40.015,15
x=int((lon+180)/360*2**z)
y=int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
# Original 1x1 PNG. This fixture is not a map dataset.
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')
with sqlite3.connect(out) as db:
    db.execute('CREATE TABLE metadata(name TEXT,value TEXT)')
    db.executemany('INSERT INTO metadata VALUES (?,?)',[('name','STRIDE import fixture'),('format','png'),('center',f'{lon},{lat},{z}'),('minzoom',str(z)),('maxzoom',str(z)),('attribution','Original test tile; not a real map')])
    db.execute('CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)')
    db.execute('CREATE UNIQUE INDEX tile_index ON tiles(zoom_level,tile_column,tile_row)')
    db.execute('INSERT INTO tiles VALUES (?,?,?,?)',(z,x,2**z-1-y,png))
print(out, 'XYZ',z,x,y)
