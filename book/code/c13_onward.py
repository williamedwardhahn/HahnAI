# Chapter: Onward

# %% on_load
import torch
import torch.nn.functional as F
from torchvision.datasets import MNIST
torch.manual_seed(0)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

def load(train):
    ds = MNIST('data', train=train, download=True)
    return (ds.data.float() / 255.0).to(device), ds.targets.to(device)

X, Y = load(train=True)             # (60000, 28, 28), values 0-1
X_test, Y_test = load(train=False)
X, X_val = X[:50000], X[50000:]     # 10,000 held out for validation
Y, Y_val = Y[:50000], Y[50000:]
print(tuple(X.shape), len(X_val), len(X_test))

# %% _helpers
import numpy as np
import matplotlib.pyplot as plt
torch.set_printoptions(precision=2, sci_mode=False, linewidth=74)

def get_batch(X, Y, batch_size):
    i = torch.randint(len(X), (batch_size,), device=X.device)
    return X[i], Y[i]

def accuracy(scores, Y):
    return (scores.argmax(dim=1) == Y).float().mean().item()

def layer(n_in, n_out):
    std = (2 / n_in) ** 0.5
    W = torch.randn(n_out, n_in, device=device) * std
    b = torch.zeros(n_out, device=device)
    return [W.requires_grad_(), b.requires_grad_()]

# %% on_patches
def patches(x):                     # (n, 28, 28) -> (n, 16, 49)
    x = x.reshape(-1, 4, 7, 4, 7).permute(0, 1, 3, 2, 4)
    return x.reshape(-1, 16, 49)

tokens = patches(X_test[:1])[0]
print(tokens.shape)

plt.figure(figsize=(2.2, 2.2))
for i in range(16):
    plt.subplot(4, 4, i + 1)
    plt.imshow(tokens[i].reshape(7, 7).cpu(), cmap='gray', vmin=0, vmax=1)
    plt.axis('off')
plt.show()  # fig: on_patches

# %% on_patch_small
a = torch.arange(16).reshape(1, 4, 4)     # a tiny 4x4 "image"
blocks = a.reshape(1, 2, 2, 2, 2)         # (image, block row, row,
                                          #  block column, column)
small = blocks.permute(0, 1, 3, 2, 4)     # the two block indices first
print(a[0])
print(small.reshape(1, 4, 4)[0])          # one 2x2 patch per row

# %% on_toy
t = torch.tensor([[1.0, 0.0],             # three tokens of two numbers
                  [0.0, 1.0],
                  [1.0, 1.0]])
Q, K = t, t                     # as if query and key layers did nothing
V = torch.tensor([[10.0], [20.0], [30.0]])  # what each token passes on
scores = Q @ K.T / 2 ** 0.5     # every query against every key
A = scores.softmax(dim=1)       # each row adds up to 1
print(scores)
print(A)
print(A @ V)                    # each token's mixture of the values

# %% on_weights
d = 64                                          # numbers per token
position = 0.1 * torch.randn(16, d, device=device)

w = (layer(49, d)                     # w[0], w[1]: patch -> token
     + [position.requires_grad_()]    # w[2]: one vector per position
     + layer(d, d)                    # w[3], w[4]: query
     + layer(d, d)                    # w[5], w[6]: key
     + layer(d, d)                    # w[7], w[8]: value
     + layer(d, 2 * d)                # w[9] to w[12]: a small network
     + layer(2 * d, d)                #    applied to each token
     + layer(d, 10))                  # w[13], w[14]: 10 class scores
print(sum(p.numel() for p in w))

# %% on_model
def model(x, w):
    t = F.linear(patches(x), w[0], w[1]) + w[2]   # (n, 16, d) tokens
    Q = F.linear(t, w[3], w[4])         # what each token looks for
    K = F.linear(t, w[5], w[6])         # what each token offers
    V = F.linear(t, w[7], w[8])         # what each token passes on
    scores = Q @ K.transpose(1, 2) / d ** 0.5     # (n, 16, 16)
    A = scores.softmax(dim=2)           # each row sums to 1
    t = t + A @ V                       # add a mix of the others
    t = t + F.linear(F.relu(F.linear(t, w[9], w[10])), w[11], w[12])
    return F.linear(t.mean(dim=1), w[13], w[14]), A

scores, A = model(X[:5], w)
print(scores.shape, A.shape)

# %% on_train
optimizer = torch.optim.Adam(w, lr=0.001)

for step in range(8001):
    x, y = get_batch(X, Y, 128)
    loss = F.cross_entropy(model(x, w)[0], y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        with torch.no_grad():
            acc = accuracy(model(X_val, w)[0], Y_val)
        print(step, round(loss.item(), 3), round(acc, 4))

# %% on_test
with torch.no_grad():
    scores, _ = model(X_test, w)
    print('test accuracy:', round(accuracy(scores, Y_test), 4))

# %% on_attention
with torch.no_grad():
    _, A = model(X_test[:2], w)
print(A[1, 5].reshape(4, 4).cpu())   # where patch 5 looks, in image 1

def heat(a):                         # 16 weights -> 28x28 picture
    return np.kron(a.reshape(4, 4).cpu().numpy(), np.ones((7, 7)))

plt.figure(figsize=(4.6, 2.4))
for row in range(2):
    image, a = X_test[row].cpu(), A[row]
    panels = [(image, 'image'), (heat(a[5]), 'patch 5 looks at'),
              (heat(a.mean(dim=0)), 'average attention')]
    for col, (p, title) in enumerate(panels):
        plt.subplot(2, 3, 3 * row + col + 1)
        plt.imshow(p, cmap='gray' if col == 0 else 'magma')
        if col == 1:
            plt.gca().add_patch(plt.Rectangle((6.5, 6.5), 7, 7,
                                fill=False, ec='white', lw=1))
        if row == 0:
            plt.title(title)
        plt.axis('off')
plt.show()  # fig: on_attention
