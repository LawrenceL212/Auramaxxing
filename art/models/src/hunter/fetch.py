# Downloads the MakeHuman base mesh and the targets build.py uses into ./mh (not committed).
# MakeHuman assets are CC0 1.0: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md
import urllib.request, os, sys, concurrent.futures as cf
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'mh', 't'), exist_ok=True)
os.chdir(os.path.join(HERE, 'mh'))
if not os.path.exists('base.obj'):
    urllib.request.urlretrieve('https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj', 'base.obj')
R='https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/'
names=[]
for sex in ('male','female'):
    for e in ('african','asian','caucasian'): names.append(f'macrodetails/{e}-{sex}-young')
    for mu in ('min','average','max'):
        for we in ('min','average','max'): names.append(f'macrodetails/universal-{sex}-young-{mu}muscle-{we}weight')
    for h in ('min','max'): names.append(f'macrodetails/height/{sex}-young-averagemuscle-averageweight-{h}height')
pair=lambda t,a='decr',b='incr':[f'{t}-{a}',f'{t}-{b}']
for t in ['torso/torso-muscle-pectoral','torso/torso-muscle-dorsi','torso/torso-vshape','buttocks/buttocks-volume','stomach/stomach-pregnant',
          'head/head-fat','head/head-scale-horiz','head/head-scale-vert','nose/nose-scale-horiz','nose/nose-scale-vert','nose/nose-hump','nose/nose-volume','nose/nose-nostrils-width','nose/nose-point-width',
          'mouth/mouth-scale-horiz','mouth/mouth-lowerlip-volume','mouth/mouth-upperlip-volume','neck/neck-scale-horiz',
          'measure/measure-waist-circ','measure/measure-hips-circ','measure/measure-bust-circ','measure/measure-upperarm-circ','measure/measure-thigh-circ','measure/measure-shoulder-dist','measure/measure-neck-circ']:
    names+=pair(t)
for side in 'lr':
    for t in ['armslegs/{s}-upperarm-muscle','armslegs/{s}-upperarm-shoulder-muscle','armslegs/{s}-lowerarm-muscle','armslegs/{s}-upperleg-muscle','armslegs/{s}-lowerleg-muscle','armslegs/{s}-upperarm-fat','armslegs/{s}-upperleg-fat',
              'eyes/{s}-eye-scale','ears/{s}-ear-scale']:
        names+=pair(t.format(s=side))
    names+=pair(f'eyes/{side}-eye-eyefold-angle','down','up'); names+=pair(f'eyes/{side}-eye-epicanthus','in','out')
for t in ['head-oval','head-round','head-rectangular','head-square','head-triangular','head-invertedtriangular','head-diamond']: names.append('head/'+t)
names+=pair('eyebrows/eyebrows-trans','down','up')
def get(n):
    p='t/'+n.replace('/','__')+'.target'
    if os.path.exists(p) and os.path.getsize(p)>0: return n,'cached'
    try:
        d=urllib.request.urlopen(R+n+'.target',timeout=60).read(); open(p,'wb').write(d); return n,len(d)
    except Exception as e: return n,'ERR '+str(e)[:40]
with cf.ThreadPoolExecutor(8) as ex:
    for n,r in ex.map(get,names):
        if not isinstance(r,int) and r!='cached': print(n,r)
print(len(names),'requested')
