# Chapter: Random features

# %% _setup
import numpy as np
import torch
import torch.nn.functional as F
import matplotlib.pyplot as plt
np.set_printoptions(precision=3, suppress=True)
torch.set_printoptions(precision=3, sci_mode=False)

# %% _montage
from skimage.util import montage

def montage_plot(images, size=3.2, grid_shape=None, symmetric=False):
    images = np.asarray(images)
    lo, hi = images.min(), images.max()
    if symmetric:                       # zero is drawn as middle gray
        hi = np.abs(images).max()
        lo = -hi
    tiled = montage(images, grid_shape=grid_shape,
                    padding_width=1, fill=lo)
    plt.figure(figsize=(size, size * tiled.shape[0] / tiled.shape[1]))
    plt.imshow(tiled, cmap='gray', vmin=lo, vmax=hi)
    plt.axis('off')
    plt.show()

# %% _device
device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% rf_curve_data
rng = np.random.default_rng(0)
x = np.sort(rng.uniform(-10, 10, 60))
y = np.exp(-0.02 * (x - 4)**2) + 0.1 * rng.normal(size=60)
x_new = np.linspace(-10, 10, 400)          # where we want predictions

# %% rf_curve
def random_layer(x, W, b):
    return np.tanh(np.outer(x, W) + b)     # (points, h)

def fit(h, seed=1):
    r = np.random.default_rng(seed)
    W, b = r.normal(0, 0.3, h), r.uniform(-3, 3, h)  # random, then frozen
    H = random_layer(x, W, b)
    w_out = np.linalg.pinv(H) @ y          # solved, not trained
    return random_layer(x_new, W, b) @ w_out

fig, axes = plt.subplots(1, 3, figsize=(4.6, 1.6), sharey=True)
for ax, h in zip(axes, [2, 10, 60]):
    ax.plot(x, y, 'k.', ms=3)
    ax.plot(x_new, fit(h), color='#f97306')
    ax.set_ylim(-0.5, 1.5)
    ax.set_title(f'h = {h}')
plt.show()  # fig: rf_curve

# %% rf_load
from torchvision.datasets import MNIST, FashionMNIST

def load(dataset):
    train = dataset('data', train=True, download=True)
    test = dataset('data', train=False, download=True)
    X = train.data.reshape(-1, 784).float().to(device) / 255
    X_test = test.data.reshape(-1, 784).float().to(device) / 255
    return X, train.targets.to(device), X_test, test.targets.to(device)

X, Y, X_test, Y_test = load(MNIST)
print(X.shape, X_test.shape)

# %% rf_bowl
T = F.one_hot(Y, 10).float()           # targets: a 1 for the right digit
W = torch.zeros(784, 10, device=device, requires_grad=True)
optimizer = torch.optim.SGD([W], lr=0.05)
for step in range(5001):
    loss = ((X @ W - T)**2).mean()     # squared error
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        print(step, round(loss.item(), 4))

# %% rf_solve
def solve(H, Y, ridge=1.0):
    """The output weights that best map features H to one-hot Y."""
    T = F.one_hot(Y, 10).cpu().double()
    Hd = H.cpu().double()                    # 64-bit numbers, see below
    G = Hd.T @ Hd + ridge * torch.eye(H.shape[1], dtype=torch.float64)
    W = torch.linalg.solve(G, Hd.T @ T)      # the bottom of the bowl
    return W.float().to(H.device)

def readout_accuracy(H, W, Y):
    return ((H @ W).argmax(dim=1) == Y).float().mean().item()

W = solve(X, Y)
print('loss ', round(((X @ W - T)**2).mean().item(), 4))
print('train', round(readout_accuracy(X, W, Y), 4))
print('test ', round(readout_accuracy(X_test, W, Y_test), 4))

# %% rf_elm
torch.manual_seed(0)

def random_features(X, W1):
    return torch.relu(X @ W1)

for h in [100, 500, 1000, 2000, 4000]:
    W1 = torch.randn(784, h, device=device) / 784**0.5   # never trained
    H = random_features(X, W1)
    W2 = solve(H, Y)
    acc = readout_accuracy(random_features(X_test, W1), W2, Y_test)
    print(f'{h:5d} random neurons   test {acc:.4f}')

# %% rf_threshold
# H and W1 are still the 4,000-neuron layer from the last pass above
H_test = random_features(X_test, W1)
H_val, Y_val = H[50_000:], Y[50_000:]       # for choosing the ridge

def best_ridge(H, Y):
    scores = {r: readout_accuracy(H_val, solve(H, Y, r), Y_val)
              for r in [0.01, 1, 10, 100]}
    return max(scores, key=scores.get)

print('images  train  test   weight size | ridge  test')
for n in [2000, 3000, 3800, 4000, 4200, 5000, 8000]:
    W2 = solve(H[:n], Y[:n], 1e-8)                # essentially no ridge
    train_acc = readout_accuracy(H[:n], W2, Y[:n])
    plain = readout_accuracy(H_test, W2, Y_test)
    r = best_ridge(H[:n], Y[:n])
    tuned = readout_accuracy(H_test, solve(H[:n], Y[:n], r), Y_test)
    print(f'{n:6d}  {train_acc:.3f}  {plain:.3f} {W2.norm():9.0f}   |'
          f' {r:<5g}  {tuned:.3f}')

# %% rf_threshold_seeds
for seed in [1, 2, 3]:                     # three other random layers
    torch.manual_seed(seed)
    W1_s = torch.randn(784, 4000, device=device) / 784**0.5
    Hs = random_features(X[:4000], W1_s)
    Hs_test = random_features(X_test, W1_s)
    W2 = solve(Hs, Y[:4000], 1e-8)
    print(seed, round(readout_accuracy(Hs_test, W2, Y_test), 3))

# %% rf_precision
def solve32(H, Y, ridge):                   # adds up in 32-bit numbers
    T = F.one_hot(Y, 10).float()
    G = (H.T @ H).cpu().double()            # converted too late
    G += ridge * torch.eye(H.shape[1], dtype=torch.float64)
    W = torch.linalg.solve(G, (H.T @ T).cpu().double())
    return W.float().to(H.device)

for name, f in [('32-bit', solve32), ('64-bit', solve)]:
    W2 = f(H[:2000], Y[:2000], 1e-4)
    print(name, round(readout_accuracy(H_test, W2, Y_test), 3))

# %% rf_kernels
torch.manual_seed(0)
kernels = torch.randn(64, 1, 5, 5, device=device)
kernels -= kernels.mean(dim=(2, 3), keepdim=True)   # average zero
kernels /= kernels.norm(dim=(2, 3), keepdim=True)   # all the same size
shown = kernels[:16, 0].cpu()
montage_plot(shown, size=4.0, grid_shape=(2, 8), symmetric=True)  # fig: rf_kernels

# %% rf_conv_features
def conv_features(X, batch=5000):
    out = []
    for i in range(0, len(X), batch):
        x = X[i:i + batch].reshape(-1, 1, 28, 28)
        z = torch.relu(F.conv2d(x, kernels, padding=2))  # (n,64,28,28)
        z = F.max_pool2d(z, 4)                           # (n,64,7,7)
        out.append(z.flatten(1))
    return torch.cat(out)

H = conv_features(X)
H_test = conv_features(X_test)
print(H.shape)
W2 = solve(H, Y)
print('test', round(readout_accuracy(H_test, W2, Y_test), 4))

# %% rf_fashion
Xf, Yf, Xf_test, Yf_test = load(FashionMNIST)
W = solve(Xf, Yf)
print('pixels         ', round(readout_accuracy(Xf_test, W, Yf_test), 4))
Hf, Hf_test = conv_features(Xf), conv_features(Xf_test)
W2 = solve(Hf, Yf)
print('random kernels ', round(readout_accuracy(Hf_test, W2, Yf_test), 4))

# %% _download
import os
from torchvision.datasets.utils import download_and_extract_archive

if not os.path.exists('data/hymenoptera_data'):
    url = 'https://download.pytorch.org/tutorial/hymenoptera_data.zip'
    download_and_extract_archive(url, 'data')

# %% rf_photos_data
from torchvision import transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader

tf = transforms.Compose([
    transforms.Resize(256), transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
train_set = ImageFolder('data/hymenoptera_data/train', tf)
test_set = ImageFolder('data/hymenoptera_data/val', tf)

def last_layer_inputs(net, dataset):    # what Chapter 16's new layer saw
    net.classifier[6] = torch.nn.Identity()
    net = net.to(device).eval()
    H, Y = [], []
    with torch.no_grad():
        for x, y in DataLoader(dataset, batch_size=64):
            H.append(net(x.to(device)))
            Y.append(y.to(device))
    return torch.cat(H), torch.cat(Y)

# %% rf_photos
from torchvision.models import alexnet, AlexNet_Weights

g = torch.Generator().manual_seed(0)
order = torch.randperm(len(train_set), generator=g)
val, fit_on = order[:50], order[50:]        # as in Chapter 16

def photo_test(net):
    H, Y = last_layer_inputs(net, train_set)
    H_t, Y_t = last_layer_inputs(net, test_set)
    def val_score(r):
        W = solve(H[fit_on], Y[fit_on], r)
        return readout_accuracy(H[val], W, Y[val])
    scores = {r: val_score(r) for r in [1e-6, 1e-4, 1e-2, 1]}
    r = max(scores, key=scores.get)
    return readout_accuracy(H_t, solve(H[fit_on], Y[fit_on], r), Y_t)

trained = alexnet(weights=AlexNet_Weights.DEFAULT)
print('pretrained', round(photo_test(trained), 3))
for seed in range(3):
    torch.manual_seed(seed)
    print('random    ', round(photo_test(alexnet()), 3))

# %% rf_signal
t = np.arange(5000) * 0.05
waves = np.sin(t) + 0.5 * np.sin(2 * t + 1) * np.cos(0.5 * t)

def van_der_pol(mu=3.0, dt=0.05, n=5000):
    x, v, out = 1.0, 0.0, []
    for i in range(n + 2000):                 # skip 2,000 to settle
        for _ in range(10):                   # ten small steps per sample
            a = mu * (1 - x**2) * v - x       # the oscillator's rule
            x, v = x + dt / 10 * v, v + dt / 10 * a
        out.append(x)
    out = np.array(out[2000:])
    return out / np.abs(out).max()

def mackey_glass(delay=17, n=5000):
    x, out = [1.2] * (10 * delay + 1), []     # a steady past to start
    for i in range(n + 1000):                 # skip 1,000 to settle
        for _ in range(10):                   # ten small steps per sample
            old = x[-10 * delay - 1]          # the level 17 samples ago
            x.append(x[-1] + 0.1 * (0.2 * old / (1 + old**10)
                                    - 0.1 * x[-1]))
        out.append(x[-1])
    out = np.array(out[1000:])
    out = out - out.mean()
    return out / np.abs(out).max()

signal = van_der_pol()
chaos = mackey_glass()
plt.figure(figsize=(4.6, 2.8))
for i, (s, name) in enumerate([(waves, 'three waves'),
                               (signal, 'Van der Pol oscillator'),
                               (chaos, 'Mackey-Glass (chaotic)')]):
    plt.subplot(3, 1, i + 1)
    plt.plot(s[:600])
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: rf_signal

# %% rf_linear
def continue_linear(s, order=6, train_len=3000, steps=400):
    rows = np.array([s[i - order:i] for i in range(order, train_len)])
    c = np.linalg.lstsq(rows, s[order:train_len], rcond=None)[0]
    history = list(s[train_len - order:train_len])
    for i in range(steps):                    # run on its own
        history.append(np.dot(c, history[-order:]))
    future = np.array(history[order:])
    return np.abs(future - s[train_len:train_len + steps]).mean()

for name, s in [('three waves', waves), ('Van der Pol', signal),
                ('Mackey-Glass', chaos)]:
    print(f'{name:12s}', [f'{continue_linear(s, k):.1e}'
                          for k in (6, 30, 100, 500)])

# %% rf_echo
r = np.random.default_rng(0)
n = 500
W_raw = r.normal(size=(n, n))
radius = np.max(np.abs(np.linalg.eigvals(W_raw)))

for strength in [0.5, 0.95, 1.2]:
    W_res = W_raw * strength / radius
    state = np.tanh(r.uniform(-1, 1, n))    # a kick, then no input
    sizes = []
    for step in range(201):
        if step in (0, 10, 50, 100, 200):
            sizes.append(f'{np.sqrt(np.mean(state**2)):.4f}')
        state = np.tanh(W_res @ state)
    print(strength, sizes)

# %% rf_reservoir
r = np.random.default_rng(1)
W_in = r.uniform(-0.5, 0.5, n)                 # all three are random
b = r.uniform(-0.2, 0.2, n)                    # and never trained
W_res = W_raw * 0.95 / radius                  # just below the edge

def step(u, state, f=np.tanh):
    return f(W_in * u + W_res @ state + b)

def fit_readout(s, f=np.tanh, train_len=3000):
    state, states = np.zeros(n), []
    for u in s[:train_len]:
        state = step(u, state, f)
        states.append(state)
    S = np.array(states[100:])                 # skip the warm-up
    targets = s[101:train_len + 1]             # the value that came next
    w_out = np.linalg.solve(S.T @ S + 1e-9 * np.eye(n), S.T @ targets)
    print(f'one-step error on the training signal '
          f'{np.abs(S @ w_out - targets).mean():.1e}')
    return w_out, state

w_out, state = fit_readout(chaos)

# %% rf_generate
def run_on_its_own(w_out, state, u, f=np.tanh, steps=400):
    generated = []
    for i in range(steps):
        state = step(u, state, f)
        u = state @ w_out                      # its own prediction
        generated.append(u)                    # becomes the next input
    return np.array(generated)

generated = run_on_its_own(w_out, state, chaos[3000])
truth = chaos[3001:3401]
print(f'average error {np.abs(truth - generated).mean():.1e}')
plt.figure(figsize=(4.6, 1.6))
plt.plot(truth, 'k', lw=5, alpha=0.25, label='true signal')
plt.plot(generated, color='#f97306', lw=1,
         label='reservoir, running on its own')
plt.legend(frameon=False, loc='lower center', ncol=2,
           bbox_to_anchor=(0.5, 1.0))
plt.xlabel('steps from the end of training')
plt.show()  # fig: rf_generate

# %% rf_no_tanh
def no_bend(z):                                # tanh removed
    return z

w_flat, state_flat = fit_readout(chaos, no_bend)
flat = run_on_its_own(w_flat, state_flat, chaos[3000], no_bend)
print(f'average error {np.abs(truth - flat).mean():.1e}')
