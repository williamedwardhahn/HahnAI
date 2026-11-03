# Chapter: Chance

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
np.set_printoptions(precision=4, suppress=True)

# %% ch_recipe
x = 0.12345                 # the seed
xs = []
for i in range(10):
    x = 3 * x % 1           # triple it, keep the part after the point
    xs.append(round(x, 4))
print(xs)

# %% ch_recipe_hist
x = 0.12345
xs = np.zeros(50_000)
for i in range(len(xs)):
    x = 3 * x % 1
    xs[i] = x

plt.figure(figsize=(4.6, 1.8))
plt.subplot(1, 2, 1)
plt.plot(xs[:200], '.', ms=2)
plt.title('the first 200')
plt.subplot(1, 2, 2)
plt.hist(xs, bins=50)
plt.title('all 50,000')
plt.show()  # fig: ch_recipe

# %% ch_doubling
x = 0.12345
for i in range(60):
    x = 2 * x % 1
    if i % 10 == 9:
        print(i + 1, x)

# %% _rng
rng = np.random.default_rng(seed=0)

# %% ch_coin
flips = rng.choice([-1, 1], size=10)
print(flips)
print(flips.sum())

# %% ch_walks
steps = rng.choice([-1, 1], size=(5, 400))
paths = steps.cumsum(axis=1)       # running total after each flip

plt.figure(figsize=(4.6, 2.2))
plt.plot(paths.T, lw=0.8)
plt.axhline(0, color='k', lw=0.5)
plt.xlabel('flip')
plt.ylabel('heads minus tails')
plt.show()  # fig: ch_walks

# %% ch_sums
N = 100                                       # flips per game
games = rng.choice([-1, 1], size=(100_000, N))
totals = games.sum(axis=1)
print(totals[:10])
print(totals.mean(), totals.std())

# %% ch_pascal
rows = 7
P = np.zeros((rows, rows + 1), dtype=int)
P[0, 1] = 1
for i in range(1, rows):
    for j in range(1, rows + 1):
        P[i, j] = P[i - 1, j - 1] + P[i - 1, j]
print(P[:, 1:])

# %% ch_binomial
from math import comb

heads = np.arange(N + 1)
paths_to = np.array([comb(N, k) for k in heads], dtype=float)
prob = paths_to / 2**N          # every path is equally likely
total = 2 * heads - N           # heads minus tails

plt.figure(figsize=(4.6, 2.2))
plt.hist(totals, bins=np.arange(-41, 42, 2), density=True,
         label='100,000 games')
plt.plot(total, prob / 2, 'k.', ms=3, label="Pascal's triangle")
plt.xlim(-40, 40)
plt.xlabel('heads minus tails after 100 flips')
plt.legend(frameon=False)
plt.show()  # fig: ch_binomial

# %% ch_normal
def normal_pdf(x, mu, sigma):
    return np.exp(-(x - mu)**2 / (2 * sigma**2)) / np.sqrt(2 * np.pi
                                                            * sigma**2)

z = rng.normal(loc=0, scale=1, size=100_000)
grid = np.linspace(-4, 4, 200)

plt.figure(figsize=(4.6, 2.0))
plt.hist(z, bins=80, density=True)
plt.plot(grid, normal_pdf(grid, 0, 1), 'k', lw=1)
plt.show()  # fig: ch_normal

print(np.mean(np.abs(z) < 1), np.mean(np.abs(z) < 2))

# %% ch_sqrt
for n in [1, 4, 16, 64, 256, 1024]:
    t = rng.choice([-1, 1], size=(20_000, n)).sum(axis=1)
    print(f'{n:5d} flips   spread {t.std():6.2f}   sqrt(N) {n**0.5:5.1f}')

# %% ch_sums_of_anything
u = rng.random((100_000, 12))          # twelve uniform numbers per row
s = u.sum(axis=1) - 6                  # their sum, centered on zero
print(round(s.mean(), 3), round(s.std(), 3))

plt.figure(figsize=(4.6, 2.0))
plt.hist(s, bins=80, density=True)
plt.plot(grid, normal_pdf(grid, 0, 1), 'k', lw=1)
plt.show()  # fig: ch_twelve

# %% ch_neuron
x = rng.random(784)                         # an "image" of 784 pixels
W = rng.normal(size=(784, 10_000))          # 10,000 random neurons
scores = x @ W
print(round(scores.std(), 2), round(np.sqrt(np.sum(x**2)), 2))

# %% ch_pi
n = 1_000_000
pts = rng.random((n, 2)) * 2 - 1           # darts in the square
inside = (pts**2).sum(axis=1) < 1          # ...that land in the circle
print(4 * inside.mean())

m = 2000
plt.figure(figsize=(2.4, 2.4))
plt.scatter(*pts[:m].T, s=1, c=np.where(inside[:m], '#f97306', '#888'))
plt.gca().set_aspect('equal')
plt.axis('off')
plt.show()  # fig: ch_pi

# %% ch_error
true_pi = np.pi
sizes = np.logspace(1, 6, 26).astype(int)
errors = []
for n in sizes:
    trials = [4 * np.mean((rng.random((n, 2))**2).sum(axis=1) < 1)
              for _ in range(20)]
    errors.append(np.mean(np.abs(np.array(trials) - true_pi)))

plt.figure(figsize=(4.6, 2.2))
plt.loglog(sizes, errors, '.-', label='typical error')
plt.loglog(sizes, 1.3 / np.sqrt(sizes), 'k--', lw=0.8,
           label='1.3 / sqrt(n)')
plt.xlabel('darts')
plt.legend(frameon=False)
plt.show()  # fig: ch_error

# %% ch_birthday
def shared_birthday(people, trials=20_000):
    days = rng.integers(0, 365, size=(trials, people))
    days.sort(axis=1)
    return np.mean((np.diff(days, axis=1) == 0).any(axis=1))

for people in [10, 20, 23, 30, 50, 70]:
    print(people, shared_birthday(people))

# %% ch_monty
trials = 100_000                       # doors are numbered 0, 1, 2
car = rng.integers(0, 3, trials)
pick = rng.integers(0, 3, trials)
other = (pick + rng.integers(1, 3, trials)) % 3   # a door not picked
host = np.where(pick == car, other,     # two goats left: either one
                3 - pick - car)         # otherwise: the one goat left
switch = 3 - pick - host                # the door neither of them chose
print('stay  ', np.mean(pick == car))
print('switch', np.mean(switch == car))

# %% ch_collector
def boxes_needed(n):
    seen, count = set(), 0
    while len(seen) < n:
        seen.add(int(rng.integers(n)))
        count += 1
    return count

n = 50
runs = [boxes_needed(n) for _ in range(5000)]
print(np.mean(runs), n * sum(1 / k for k in range(1, n + 1)))
