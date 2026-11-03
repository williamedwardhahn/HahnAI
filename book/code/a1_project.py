# Appendix: A project of your own

# %% _setup
import os
import numpy as np
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.datasets import ImageFolder
from torchvision.models import alexnet, AlexNet_Weights
from torch.utils.data import DataLoader, Subset

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% _download
from torchvision.datasets.utils import download_and_extract_archive

if not os.path.exists('data/hymenoptera_data'):
    url = 'https://download.pytorch.org/tutorial/hymenoptera_data.zip'
    download_and_extract_archive(url, 'data')

# %% pj_folders
data_dir = 'data/hymenoptera_data'      # replace with your own folder
for split in ['train', 'val']:
    counts = {name: len(os.listdir(f'{data_dir}/{split}/{name}'))
              for name in sorted(os.listdir(f'{data_dir}/{split}'))}
    print(split, counts)

# %% pj_transforms
normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
val_tf = transforms.Compose([transforms.Resize(256),
                             transforms.CenterCrop(224),
                             transforms.ToTensor(), normalize])
train_tf = transforms.Compose([transforms.RandomResizedCrop(224),
                               transforms.RandomHorizontalFlip(),
                               transforms.ToTensor(), normalize])

# %% _evaluate
def evaluate(net, loader):                   # as in Chapter 16
    net.eval()
    correct = 0
    with torch.no_grad():
        for x, y in loader:
            guesses = net(x.to(device)).argmax(dim=1)
            correct += (guesses == y.to(device)).sum().item()
    return correct / len(loader.dataset)

# %% pj_experiment
def run_experiment(lr=0.001, batch_size=16, augment=True, epochs=5,
                   seed=0):
    train_all = ImageFolder(f'{data_dir}/train',
                            train_tf if augment else val_tf)
    val_all = ImageFolder(f'{data_dir}/train', val_tf)
    g = torch.Generator().manual_seed(0)     # the same split every run
    split = torch.randperm(len(train_all), generator=g).tolist()
    torch.manual_seed(seed)                  # the luck that varies
    train_loader = DataLoader(Subset(train_all, split[50:]),
                              batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(Subset(val_all, split[:50]), batch_size=64)

    net = alexnet(weights=AlexNet_Weights.DEFAULT)
    net.requires_grad_(False)
    net.classifier[6] = nn.Linear(4096, len(train_all.classes))
    net = net.to(device)
    head = net.classifier[6].parameters()
    optimizer = torch.optim.SGD(head, lr=lr, momentum=0.9)

    for epoch in range(epochs):
        net.train()
        for x, y in train_loader:
            loss = nn.functional.cross_entropy(net(x.to(device)),
                                               y.to(device))
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
    return evaluate(net, val_loader)         # after the last epoch

print(run_experiment())

# %% pj_grid
import itertools
import csv

grid = {'lr': [0.01, 0.001], 'augment': [True, False]}
seeds = [0, 1, 2]

rows = []
for lr, augment in itertools.product(grid['lr'], grid['augment']):
    accs = [run_experiment(lr=lr, augment=augment, seed=s)
            for s in seeds]
    rows.append({'lr': lr, 'augment': augment,
                 'mean': np.mean(accs), 'min': min(accs),
                 'max': max(accs)})
    print(f'lr {lr:<6} augment {augment!s:5}  '
          f'{np.mean(accs):.3f}  ({min(accs):.2f} to {max(accs):.2f})')

with open('data/experiments.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

# %% pj_plot
labels = [f"lr {r['lr']}\n{'aug' if r['augment'] else 'no aug'}"
          for r in rows]
means = np.array([r['mean'] for r in rows])
low = means - [r['min'] for r in rows]
high = [r['max'] for r in rows] - means

plt.figure(figsize=(4.6, 2.0))
plt.errorbar(labels, means, yerr=[low, high], fmt='o', capsize=4)
plt.ylim(0.5, 1.0)
plt.ylabel('validation accuracy')
plt.show()  # fig: pj_grid

# %% pj_life_data
import torch.nn.functional as F

neighbors = torch.ones(1, 1, 3, 3, device=device)
neighbors[0, 0, 1, 1] = 0

def wrap(x):                           # join opposite edges of the grid
    return F.pad(x, (1, 1, 1, 1), mode='circular')

def life_step(world):                  # the true rule, from Chapter 13
    n = F.conv2d(wrap(world), neighbors)
    return ((n == 3) | ((world == 1) & (n == 2))).float()

def random_worlds(k, size=32):         # each with its own density
    density = 0.1 + 0.6 * torch.rand(k, 1, 1, 1, device=device)
    return (torch.rand(k, 1, size, size, device=device) < density).float()

# %% pj_life_net
torch.manual_seed(0)
w = [(0.5 * torch.randn(8, 1, 3, 3, device=device)).requires_grad_(),
     torch.zeros(8, device=device, requires_grad=True),
     (0.5 * torch.randn(1, 8, 1, 1, device=device)).requires_grad_(),
     torch.zeros(1, device=device, requires_grad=True)]

def life_net(x, w):
    h = F.relu(F.conv2d(wrap(x), w[0], w[1]))   # 8 detectors, 3x3 each
    return F.conv2d(h, w[2], w[3])              # mixed into one score

# %% pj_life_train
optimizer = torch.optim.Adam(w, lr=0.01)
for step in range(3001):
    before = random_worlds(64)
    after = life_step(before)
    loss = F.binary_cross_entropy_with_logits(life_net(before, w), after)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        print(step, f'{loss.item():.5f}')

# %% pj_life_test
with torch.no_grad():
    before = random_worlds(500)               # worlds it has never seen
    guess = (life_net(before, w) > 0).float()
    wrong = (guess != life_step(before)).sum().item()
print(f'{wrong} wrong cells out of {before.numel():,}')

# %% pj_life_all
codes = torch.arange(512, device=device)
bits = (codes[:, None] >> torch.arange(9, device=device)) & 1
patches = bits.float().view(512, 1, 3, 3)   # every 3x3 neighborhood
with torch.no_grad():
    guess = (life_net(patches, w) > 0).float()[:, 0, 1, 1]
truth = life_step(patches)[:, 0, 1, 1]     # the middle cell's fate
print(f'{(guess != truth).sum().item()} wrong out of {len(codes)}')

# %% pj_life_glider
world = torch.zeros(1, 1, 12, 12, device=device)
world[0, 0, 1, 2] = world[0, 0, 2, 3] = 1
world[0, 0, 3, 1] = world[0, 0, 3, 2] = world[0, 0, 3, 3] = 1

plt.figure(figsize=(4.6, 1.0))
for i in range(6):
    plt.subplot(1, 6, i + 1)
    plt.imshow(world[0, 0].cpu(), cmap='gray_r', vmin=0, vmax=1)
    plt.title(f'step {4 * i}')
    plt.xticks([])
    plt.yticks([])
    plt.gca().spines[:].set_visible(True)
    for _ in range(4):                        # the network's rule, not
        with torch.no_grad():                 # Conway's
            world = (life_net(world, w) > 0).float()
plt.show()  # fig: pj_life
