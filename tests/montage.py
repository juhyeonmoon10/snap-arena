import sys
from PIL import Image
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f) for f in files]
w, h = ims[0].size
s = float(__import__('os').environ.get('S', '1'))
w2, h2 = int(w*s), int(h*s)
rows = (len(ims)+cols-1)//cols
m = Image.new('RGB', (w2*cols, h2*rows), 'white')
for i, im in enumerate(ims):
    m.paste(im.resize((w2, h2)), ((i%cols)*w2, (i//cols)*h2))
m.save(out, quality=85)
