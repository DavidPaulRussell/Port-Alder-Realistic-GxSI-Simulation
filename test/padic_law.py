# Search/verify the BF2 5-adic law on Z/5^n, n=8.
P, N = 5, 8; M = P**N
def T5(x): return (x + 5*x*x + 1) % M
x, n = 0, 0
while True:
    x = T5(x); n += 1
    if x == 0 or n > M: break
print("period of T5 from 0:", n, "== 5^8:", n == M)
# 1-Lipschitz check on random pairs: x≡y mod 5^i  =>  T5(x)≡T5(y) mod 5^i
import random; random.seed(1); ok=True
for _ in range(20000):
    i = random.randint(1,N); a = random.randrange(M); b = (a + random.randrange(1, P**(N-i)+1)*P**i) % M
    if (T5(a)-T5(b)) % P**i: ok=False
print("T5 is 1-Lipschitz (5-adic):", ok)
