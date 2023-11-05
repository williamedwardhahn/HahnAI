# Hahn AI Blog Engine
# William Edward Hahn
# All Rights Reserved
# This program writes HTML files to a webserver folder by scraping google sheets urls
# 6/14/23
#####################################################################################
import pandas as pd
import os
from string import Template
import requests
from PIL import Image

site_path = "/home/hahn/Desktop/HahnAI/blog/"
image_path ="https://raw.githubusercontent.com/williamedwardhahn/HahnAI/main/blog/"
url_blog    = "https://docs.google.com/spreadsheets/d/12Aq-6jKjghX7TxJJPdAdVR8TfnImP5uZ2JhQYecjHK4/edit#gid=745755078"

def get_database(url):
    url_head = "https://docs.google.com/spreadsheets/d/"
    url_foot = "/gviz/tq?tqx=out:csv&sheet="
    url_body = url.split('/')[5]
    sheet_name = "1"
    url_csv = url_head + url_body + url_foot + sheet_name
    df = pd.read_csv(url_csv, sep=',', skiprows=0)
    return df
    
def download_image(image_id, filename):
    url = f'https://drive.google.com/uc?export=download&id={image_id}'
    response = requests.get(url)
    #print(response.text)
    with open(filename, 'wb') as file:
        file.write(response.content)

def compress_image(image_path):
    if os.path.getsize(image_path) > 0:  # Check if file is not empty
        picture = Image.open(image_path).convert("RGB")
        picture.save("compressed_" + image_path, "JPEG", optimize=True, quality=30)
    else:
        print(f"Image file {image_path} is empty. Skipping compression.")
  
    
head = '''<!DOCTYPE HTML>
<html>
<head>
<link rel="icon" type="image/png" href="../images/favicon-32x32.png" sizes="32x32" />
<link rel="icon" type="image/png" href="../images/favicon-16x16.png" sizes="16x16" />
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZDVLMSSQ0M"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-ZDVLMSSQ0M');
</script>


<title>Hahn AI</title>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="assets/css/main.css" />
</head>
<body>
<header id="header">
<a href="index.html" class="logo"><strong>Hahn</strong> AI</a>
</header>
'''



blog = '''
<section id="main">
<div class="inner">
<a href = 'blog$i.html'><h4>$title</h4></a>
<p><span class="image left"><a href = 'blog$i.html'><img src="$image" alt="" /></a> </span>$content <a href = 'blog$i.html'>...Read More</a></p>
'''

blog_foot = '''				
</div>
</section>
<br>
'''

foot = '''
<footer id="footer">
<div class="copyright">
&copy; Hahn AI <a href="https://Hahn.ai">Main Site</a>.
</div>
</footer>
<script src="assets/js/jquery.min.js"></script>
<script src="assets/js/jquery.scrolly.min.js"></script>
<script src="assets/js/skel.min.js"></script>
<script src="assets/js/util.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>'''


#####################################################################################
#Index Page
#####################################################################################

blog = Template(blog)

df_blog  = get_database(url_blog)

source_blog = head

for i in reversed(range(len(df_blog))):

    print(df_blog["Post Title"][i])

    image_id = str(df_blog["Post Image"][i]).split('=')[1]
    image_filename = f'image_{i}.jpeg'
    
    if not os.path.exists(image_filename): 

	    download_image(image_id, image_filename)

	    compress_image(image_filename)

    photo_url = image_path + "compressed_" + image_filename  # use compressed image

    source_blog += blog.substitute(i = i, title=df_blog["Post Title"][i], image=photo_url, content=df_blog["Post Text"][i][:800]) + blog_foot 
    
source_blog    += 6*"<br>" +foot

print(source_blog,    file=open(site_path + "blog-1.html",    'w'))
print(source_blog,    file=open(site_path + "index.html",    'w'))

#####################################################################################
#####################################################################################
#####################################################################################

#####################################################################################
#Blog Pages
#####################################################################################    


blog = '''
<section id="main">
<div class="inner">
<h4>$title</h4>
<p><span class="image left"><img src="$image" alt="" /></span>$content</p>
'''

blog = Template(blog)

last = len(df_blog)-1

foot = f'''
<footer id="footer">
<div class="copyright">
&copy; Hahn AI <a href="https://Hahn.ai">Main Site</a>.
</div>
</footer>
<script src="assets/js/jquery.min.js"></script>
<script src="assets/js/jquery.scrolly.min.js"></script>
<script src="assets/js/skel.min.js"></script>
<script src="assets/js/util.js"></script>
<script src="assets/js/main.js"></script>
<script>
function generateNavigation() {{
    let currentURL = window.location.href;
    let baseURL = currentURL.substring(0, currentURL.lastIndexOf("/") + 1);
    let currentPage = currentURL.substring(currentURL.lastIndexOf("/") + 1);
    let currentPageNumber = parseInt(currentPage.replace(/\D/g,''));

    let prevPageNumber = currentPageNumber - 1;
    let nextPageNumber = currentPageNumber + 1;
    let nextPage;
    
    let prevPage = baseURL + "blog" + prevPageNumber + ".html";
    if (nextPageNumber > {last}) {{
        nextPage = baseURL + "blog" + {last} + ".html";
    }} else {{
        nextPage = baseURL + "blog" + nextPageNumber + ".html";
    }}
    let firstPage = baseURL + "blog0.html";
    let lastPage  = baseURL + "blog" + {last} + ".html";
    let indexPage = baseURL + "blog-1.html"; 

    let navigationHTML = `
        <br><br><br><center><nav>
            <a href="${{indexPage}}" class="index">Index</a>  |
            <a href="${{firstPage}}" class="first">First</a>  |  
            <a href="${{prevPage}}" class="previous">Previous</a>  |  
            <a href="${{nextPage}}" class="next">Next</a>  | 
            <a href="${{lastPage}}" class="last">Last</a>
        </nav></center>
    `;

    // Add the navigation to the end of each section
    let sections = document.getElementsByTagName('section');
    
    sections[0].innerHTML += navigationHTML;
    
}}
// Call the function here
generateNavigation();
</script>
</body>
</html>'''



for i in range(len(df_blog)):

    source_blog = head

    print(df_blog["Post Title"][i])

    image_id = str(df_blog["Post Image"][i]).split('=')[1]
    
    image_filename = f'image_{i}.jpeg'  # systematic filename

    photo_url = image_path + "compressed_" + image_filename  # use compressed image

    source_blog += blog.substitute(title=df_blog["Post Title"][i], image=photo_url, content=df_blog["Post Text"][i]) + blog_foot
    
    source_blog    += 3*"<br>" + foot 
    
    print(source_blog,    file=open(site_path + f"blog{i}.html",    'w'))
    
#####################################################################################
    
    
    
    
#####################################################################################
# Push to GitHub
#####################################################################################    
os.chdir(site_path)    
os.system("git add . ")
os.system("git add .. ")    
os.system("git commit -m 'update'")  
os.system("git push origin main --force") #--force    
    
    
    



    
    
    
    
    
    
    
    
    
    
