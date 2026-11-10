"""Generates the Tiled map files in src/maps/. Edit the layouts here, or open the .tmj files in Tiled."""
import json, sys

def build(path, name, biome, paths, flights, drops, blocked, cover, decor, width=1440, height=900):
    oid = [0]
    def nid():
        oid[0] += 1
        return oid[0]
    P = lambda n, t, v: {"name": n, "type": t, "value": v}
    def obj(name, x=0, y=0, **extra):
        o = {"id": nid(), "name": name, "type": "", "x": x, "y": y, "rotation": 0, "visible": True, "width": 0, "height": 0}
        o.update(extra)
        return o
    def og(lid, name, objs):
        return {"id": lid, "name": name, "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": objs}
    pts = lambda l: [{"x": x, "y": y} for x, y in l]
    layers = [
        og(1, "paths", [obj(n, polyline=pts(p), properties=[P("width", "float", 56)]) for n, p in paths]),
        og(2, "zones", [obj(n, polygon=pts(p), properties=[P("kind", "string", "blocked"), P("look", "string", look)]) for n, p, look in blocked]),
        og(3, "cover", [obj(t, x, y, point=True, properties=[P("coverType", "string", t)]) for t, x, y in cover]),
        og(4, "decor", [obj(n, x, y, point=True, properties=[P("prop", "string", n)]) for n, x, y in decor]),
        og(5, "flight", [obj(n, polyline=pts(p)) for n, p in flights]),
        og(6, "drops", [obj("drop", x, y, point=True) for x, y in drops]),
    ]
    m = {"compressionlevel": -1, "height": height // 20, "width": width // 20, "tilewidth": 20, "tileheight": 20, "infinite": False,
         "orientation": "orthogonal", "renderorder": "right-down", "tiledversion": "1.11.0", "type": "map", "version": "1.10",
         "nextlayerid": 7, "nextobjectid": oid[0] + 1, "properties": [P("biome", "string", biome), P("name", "string", name)],
         "layers": layers, "tilesets": []}
    json.dump(m, open(path, "w"), indent=1)

# ---------------------------------------------------------------- Map 1: Firebase Ridgeline
build("src/maps/outpost01.tmj", "Firebase Ridgeline", "ashlands",
    paths=[("path_a", [(1500,170),(1180,170),(1090,250),(1090,500),(1000,590),(650,590),(560,500),(560,290),(480,210),(330,210),(250,290),(250,600),(160,690),(-60,690)])],
    flights=[("flight_a", [(1500,320),(980,400),(620,300),(300,420),(-60,690)])],
    drops=[(560,400)],
    blocked=[("rocks",[(700,240),(800,220),(850,290),(790,340),(710,320)],"rock"),
             ("pond",[(560,700),(700,680),(760,760),(680,840),(560,820),(520,760)],"water"),
             ("cliff",[(0,0),(200,0),(170,90),(90,140),(0,160)],"cliff"),
             ("rocks",[(1300,520),(1400,480),(1440,560),(1440,700),(1340,680)],"rock"),
             ("ridge",[(1150,780),(1300,760),(1440,800),(1440,900),(1130,900)],"cliff")],
    cover=[("bunker",405,420),("ruins",830,470),("trench",820,700),("sandbags",1000,380),("sandbags",1250,320),("sandbags",400,110),("sandbags",130,470),("sandbags",330,790)],
    decor=[("floodlight",70,620),("floodlight",70,760),("crate",120,600),("crate",95,780),("wreck",930,150),("wreck",300,450),("floodlight",405,420)])

# ---------------------------------------------------------------- Map 2: Twin Rivers Junction
tail = [(760,450),(620,450),(540,370),(400,370),(320,450),(320,620),(220,700),(-60,700)]
build("src/maps/outpost02.tmj", "Dustline Junction", "ashlands",
    paths=[("path_a", [(1500,120),(1220,120),(1120,200),(1120,330),(1020,420)] + tail),
           ("path_b", [(1500,800),(1240,800),(1140,720),(1000,720),(900,620),(820,470)] + tail)],
    flights=[("flight_a", [(1500,460),(900,300),(400,560),(-60,660)])],
    drops=[(640,450)],
    blocked=[("rocks",[(560,560),(640,540),(660,610),(590,640)],"rock"),
             ("pond",[(1300,400),(1420,380),(1440,520),(1320,540)],"water"),
             ("cliff",[(0,0),(260,0),(220,110),(0,150)],"cliff"),
             ("ridge",[(500,840),(800,820),(900,900),(480,900)],"cliff")],
    cover=[("bunker",450,470),("ruins",980,560),("sandbags",1220,230),("sandbags",1250,680),("trench",700,330),("sandbags",200,520),("sandbags",450,780),("ruins",760,620)],
    decor=[("floodlight",60,640),("floodlight",60,760),("crate",110,620),("wreck",880,180),("wreck",1180,560),("floodlight",450,470)])
print("maps written")
