"""Devolve (cx, cy, w) do maior rosto num PNG recortado, em px da imagem."""
import cv2, sys, numpy as np, json
def rosto(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4:
        a = im[:, :, 3:4] / 255.0; im = (im[:, :, :3] * a + 110 * (1 - a)).astype(np.uint8)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    rs = cas.detectMultiScale(g, 1.1, 6, minSize=(60, 60))
    if len(rs) == 0: rs = cas.detectMultiScale(g, 1.05, 3, minSize=(60, 60))
    if len(rs) == 0:
        c2 = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'); rs = c2.detectMultiScale(g, 1.05, 3, minSize=(60, 60))
    x, y, w, h = max(rs, key=lambda r: r[2] * r[3])
    return dict(cx=int(x + w / 2), cy=int(y + h / 2), w=int(w), W=im.shape[1], H=im.shape[0])
if __name__ == '__main__': print(json.dumps(rosto(sys.argv[1])))
