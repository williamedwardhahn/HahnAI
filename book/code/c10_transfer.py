# Chapter: Teaching an old network new tricks

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
import torch
torch.set_printoptions(precision=3, sci_mode=False)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% tf_folders
import os
from torchvision.datasets.utils import download_and_extract_archive

data_dir = 'data/hymenoptera_data'
if not os.path.exists(data_dir):        # 47 MB, downloaded only once
    url = 'https://download.pytorch.org/tutorial/hymenoptera_data.zip'
    download_and_extract_archive(url, 'data')
for split in ['train', 'val']:
    for name in sorted(os.listdir(f'{data_dir}/{split}')):
        n = len(os.listdir(f'{data_dir}/{split}/{name}'))
        print(split, name, n)

# %% tf_transforms
from torchvision import transforms

normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
train_tf = transforms.Compose([
    transforms.RandomResizedCrop(224),     # a random part of the photo
    transforms.RandomHorizontalFlip(),     # mirrored half of the time
    transforms.ToTensor(),
    normalize,
])
val_tf = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    normalize,
])

# %% tf_loaders
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader, Subset
torch.manual_seed(0)

train_all = ImageFolder(f'{data_dir}/train', train_tf)
plain_all = ImageFolder(f'{data_dir}/train', val_tf)  # same, unaugmented
order = torch.randperm(len(train_all)).tolist()
train_data = Subset(train_all, order[50:])
val_data = Subset(plain_all, order[:50])          # 50 for validation
test_data = ImageFolder(f'{data_dir}/val', val_tf)  # kept for the end

train_loader = DataLoader(train_data, batch_size=16, shuffle=True)
val_loader = DataLoader(val_data, batch_size=64)
test_loader = DataLoader(test_data, batch_size=64)

classes = train_all.classes
print(classes, len(train_data), len(val_data), len(test_data))

# %% tf_show
def show(t):                       # undo the normalization, for display
    mean = torch.tensor([0.485, 0.456, 0.406])[:, None, None]
    std = torch.tensor([0.229, 0.224, 0.225])[:, None, None]
    return (t * std + mean).clamp(0, 1).permute(1, 2, 0).numpy()

images, labels = next(iter(train_loader))
plt.figure(figsize=(4.6, 2.6))
for i in range(8):
    plt.subplot(2, 4, i + 1)
    plt.imshow(show(images[i]))
    plt.title(classes[labels[i]])
    plt.axis('off')
plt.show()  # fig: tf_batch

# %% tf_model
import torch.nn as nn
from torchvision.models import alexnet, AlexNet_Weights

net = alexnet(weights=AlexNet_Weights.DEFAULT)
print(net.classifier[6])
net.requires_grad_(False)                     # freeze every weight...
net.classifier[6] = nn.Linear(4096, len(classes))   # ...add a new layer
net = net.to(device)
print(net.classifier[6])
print([p.shape for p in net.parameters() if p.requires_grad])

# %% tf_evaluate
def evaluate(net, loader):
    net.eval()
    correct = 0
    with torch.no_grad():
        for x, y in loader:
            guesses = net(x.to(device)).argmax(dim=1)
            correct += (guesses == y.to(device)).sum().item()
    return correct / len(loader.dataset)

print(round(evaluate(net, val_loader), 3))

# %% tf_train
def train(net, params, epochs, lr=0.001):
    optimizer = torch.optim.SGD(params, lr=lr, momentum=0.9)
    history = []
    for epoch in range(epochs):
        net.train()                                  # dropout on
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            loss = nn.functional.cross_entropy(net(x), y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        acc = evaluate(net, val_loader)              # switches to eval()
        history.append(round(acc, 3))
    print('validation accuracy by epoch:')
    print(history)
    return history

frozen = train(net, net.classifier[6].parameters(), epochs=10)

# %% tf_finetune
tuned_net = alexnet(weights=AlexNet_Weights.DEFAULT)
tuned_net.classifier[6] = nn.Linear(4096, len(classes))
tuned_net = tuned_net.to(device)
tuned = train(tuned_net, tuned_net.parameters(), epochs=10)

# %% tf_scratch
scratch_net = alexnet()                          # random weights
scratch_net.classifier[6] = nn.Linear(4096, len(classes))
scratch_net = scratch_net.to(device)
scratch = train(scratch_net, scratch_net.parameters(), epochs=10)

# %% tf_compare
results = {'last layer only': (net, frozen),
           'fine-tune all': (tuned_net, tuned),
           'from scratch': (scratch_net, scratch)}
for name, (model, history) in results.items():
    test_acc = evaluate(model, test_loader)
    print(f'{name:16} validation {history[-1]:.3f}  test {test_acc:.3f}')

# %% tf_zeroshot
names = AlexNet_Weights.DEFAULT.meta['categories']
ant, bee = names.index('ant'), names.index('bee')
print(ant, names[ant], bee, names[bee])

zero_shot = alexnet(weights=AlexNet_Weights.DEFAULT)
old = zero_shot.classifier[6]                 # the 1,000 ImageNet scores
zero_shot.classifier[6] = nn.Linear(4096, 2)  # keep only two of them
with torch.no_grad():
    zero_shot.classifier[6].weight.copy_(old.weight[[ant, bee]])
    zero_shot.classifier[6].bias.copy_(old.bias[[ant, bee]])
zero_shot = zero_shot.to(device)
print('validation', evaluate(zero_shot, val_loader),
      ' test', round(evaluate(zero_shot, test_loader), 3))

# %% tf_predictions
net.eval()                                 # last layer only
picks = range(0, len(test_data), 19)       # spread across both classes
x = torch.stack([test_data[k][0] for k in picks])
y = torch.tensor([test_data[k][1] for k in picks])
with torch.no_grad():
    guesses = net(x.to(device)).argmax(dim=1).cpu()

plt.figure(figsize=(4.6, 2.6))
for i in range(8):
    plt.subplot(2, 4, i + 1)
    plt.imshow(show(x[i]))
    color = 'black' if guesses[i] == y[i] else 'red'
    plt.title(classes[guesses[i]], color=color)
    plt.axis('off')
plt.show()  # fig: tf_predictions

# %% tf_save
torch.save(net.state_dict(), 'data/ants_bees.pt')

# %% tf_load
from PIL import Image

def load_model(path):
    net = alexnet()
    net.classifier[6] = nn.Linear(4096, len(classes))
    net.load_state_dict(torch.load(path, map_location=device))
    return net.to(device).eval()

def predict(net, image_file):
    image = Image.open(image_file).convert('RGB')
    x = val_tf(image)[None].to(device)
    with torch.no_grad():
        probs = net(x).softmax(dim=1)[0]
    return classes[probs.argmax()], round(probs.max().item(), 3)

model = load_model('data/ants_bees.pt')
folder = f'{data_dir}/val/bees'
photo = os.path.join(folder, sorted(os.listdir(folder))[0])
print(predict(model, photo))
