# Chapter: Inside AlexNet

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
from skimage.util import montage
import torch
torch.manual_seed(0)
torch.set_printoptions(precision=3, sci_mode=False)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% ax_load
from torchvision.models import alexnet, AlexNet_Weights

weights = AlexNet_Weights.DEFAULT
net = alexnet(weights=weights).to(device)
net.eval()
print(net)

# %% ax_labels
labels = weights.meta['categories']
print(len(labels))
print(labels[:5])
print(labels[281:286])

# %% ax_preprocess
from torchvision import transforms

preprocess = transforms.Compose([
    transforms.Resize(256),           # shorter side to 256 pixels
    transforms.CenterCrop(224),       # the central 224 x 224 square
    transforms.ToTensor(),            # to a (3, 224, 224) tensor, 0-1
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

# %% ax_classify
from PIL import Image
from skimage import data

cat = Image.fromarray(data.chelsea())
x = preprocess(cat)[None].to(device)       # a batch of one
print(x.shape)

with torch.no_grad():
    scores = net(x)
probs = scores.softmax(dim=1)
top = probs.topk(5)
for p, i in zip(top.values[0], top.indices[0]):
    print(f'{p.item():6.1%}  {labels[i]}')

# %% ax_classify_fn
def classify(image, k=3):
    x = preprocess(Image.fromarray(image))[None].to(device)
    with torch.no_grad():
        probs = net(x).softmax(dim=1)[0]
    top = probs.topk(k)
    return [(labels[i], round(p.item(), 3))
            for p, i in zip(top.values, top.indices)]

photos = {'astronaut': data.astronaut(), 'coffee': data.coffee(),
          'rocket': data.rocket()}
for name, image in photos.items():
    print(name, classify(image))

# %% ax_photos
plt.figure(figsize=(4.6, 1.5))
for i, (name, image) in enumerate(photos.items()):
    plt.subplot(1, 3, i + 1)
    plt.imshow(image)
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: ax_photos

# %% ax_eval
net.train()                           # training mode: dropout is on
with torch.no_grad():
    a, b = net(x), net(x)
print(torch.allclose(a, b))

net.eval()                            # evaluation mode: dropout is off
with torch.no_grad():
    a, b = net(x), net(x)
print(torch.allclose(a, b))

# %% ax_filters
w0 = net.features[0].weight.detach().cpu()        # (64, 3, 11, 11)
print(w0.shape)
f = w0.permute(0, 2, 3, 1).numpy()                # (64, 11, 11, 3)
f = (f - f.min()) / (f.max() - f.min())           # rescale to 0-1
tiled = montage(f, grid_shape=(8, 8), padding_width=1, fill=(1, 1, 1),
                channel_axis=-1)
plt.figure(figsize=(3.2, 3.2))
plt.imshow(tiled)
plt.axis('off')
plt.show()  # fig: ax_filters

# %% ax_maps
with torch.no_grad():
    maps = net.features[:2](x)                    # first conv + ReLU
print(maps.shape)

def brighten(maps):                  # scale each map to a maximum of 1
    return maps / (maps.amax(dim=(1, 2), keepdim=True) + 1e-6)

crop = transforms.CenterCrop(224)(transforms.Resize(256)(cat))
picks = [1, 5, 13, 21, 37, 47, 52, 58]           # eight of the 64
shown = brighten(maps[0, picks]).cpu().numpy()

plt.figure(figsize=(4.0, 4.4))
plt.subplot(3, 3, 1)
plt.imshow(crop)
plt.title('input')
plt.axis('off')
for i, k in enumerate(picks):
    plt.subplot(3, 3, i + 2)
    plt.imshow(shown[i], cmap='gray')
    plt.title(f'map {k}')
    plt.axis('off')
plt.show()  # fig: ax_maps

# %% ax_deep_maps
with torch.no_grad():
    deep = net.features(x)                        # all conv layers
print(deep.shape)
deep_maps = brighten(deep[0, :64]).cpu().numpy()  # (64, 6, 6)
tiled = montage(deep_maps, grid_shape=(8, 8), padding_width=1, fill=0.5)
plt.figure(figsize=(3.2, 3.2))
plt.imshow(tiled, cmap='gray', vmin=0, vmax=1)
plt.axis('off')
plt.show()  # fig: ax_deep_maps

# %% ax_manual
import torch.nn.functional as F

c = [net.features[i] for i in (0, 3, 6, 8, 10)]  # the conv layers
fc = [net.classifier[i] for i in (1, 4, 6)]      # the linear layers

def alexnet_by_hand(x, show=False):
    x = F.relu(F.conv2d(x, c[0].weight, c[0].bias, stride=4, padding=2))
    x = F.max_pool2d(x, kernel_size=3, stride=2)
    if show: print(x.shape)
    x = F.relu(F.conv2d(x, c[1].weight, c[1].bias, padding=2))
    x = F.max_pool2d(x, kernel_size=3, stride=2)
    if show: print(x.shape)
    x = F.relu(F.conv2d(x, c[2].weight, c[2].bias, padding=1))
    x = F.relu(F.conv2d(x, c[3].weight, c[3].bias, padding=1))
    x = F.relu(F.conv2d(x, c[4].weight, c[4].bias, padding=1))
    x = F.max_pool2d(x, kernel_size=3, stride=2)
    if show: print(x.shape)
    x = F.adaptive_avg_pool2d(x, 6).flatten(start_dim=1)
    if show: print(x.shape)
    x = F.relu(F.linear(x, fc[0].weight, fc[0].bias))
    x = F.relu(F.linear(x, fc[1].weight, fc[1].bias))
    return F.linear(x, fc[2].weight, fc[2].bias)

with torch.no_grad():
    mine = alexnet_by_hand(x, show=True)
    theirs = net(x)
print(torch.allclose(mine, theirs, atol=1e-4))
print(labels[mine.argmax()])

# %% ax_count
print(sum(p.numel() for p in net.parameters()))

# %% ax_save
torch.save(net.state_dict(), 'data/alexnet.pt')

copy = alexnet()                                  # random weights
copy.load_state_dict(torch.load('data/alexnet.pt', map_location=device))
copy = copy.to(device).eval()
with torch.no_grad():
    print(torch.allclose(copy(x), net(x)))
