# Independent NumPy references for both ByteFoundry stages.
import numpy as np, sys
def nsum(A):
    s=np.zeros_like(A)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if dy or dx: s=s+np.roll(np.roll(A,dy,0),dx,1)
    return s
def life(alive):
    n=nsum(alive.astype(np.int64)); return ((n==3)|((alive==1)&(n==2))).astype(np.int64)
def bf1(P,steps):            # P: (8,H,W) int64 in Z/2^20
    m=(1<<20)-1
    for _ in range(steps):
        lo=np.stack([life(P[k]&1) for k in range(8)])
        S=np.stack([nsum(P[(k+1)%8])&m for k in range(8)])
        T=(P+((P*P)&m|5))&m
        P=(lo+2*((T^S)&m))&m
    return P
def dadd5(a,b,n=8):
    r=np.zeros_like(a); pw=1
    for _ in range(n): r+=((a%5+b%5)%5)*pw; pw*=5; a=a//5; b=b//5
    return r
def bf2(P,steps):            # P: 20-bit words; encode, run in Z/5^8, decode
    M=5**8
    X=(P&1)+5*((P>>1)%(M//5))
    for _ in range(steps):
        lo=np.stack([life((X[k]%5!=0).astype(np.int64)) for k in range(8)])
        S=np.stack([nsum(X[(k+1)%8])%M for k in range(8)])
        T=(X+5*(X*X%M)+1)%M
        X=(lo+5*dadd5(T,S))%M
    return ((X%5)&1)|(((X//5)<<1)&0xFFFFF)
def load(f): return np.fromfile(f,'<u4').reshape(128,128,8).transpose(2,0,1).astype(np.int64)
def dump(P,f): np.ascontiguousarray(P.transpose(1,2,0)).astype('<u4').tofile(f)
if __name__=='__main__':
    rng=np.random.default_rng(7)
    P=rng.integers(0,1<<20,size=(8,128,128),dtype=np.int64)
    dump(P,'test/in.bin')
    dump(bf1(P,40),'test/bf1_40.bin')
    dump(bf2(P,40),'test/bf2_40.bin')
    dump(bf2(bf1(P,40),40),'test/pipe_40_40.bin')
    print('numpy references written')
