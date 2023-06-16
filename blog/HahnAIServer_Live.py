# Hahn AI Blog Engine
# William Edward Hahn
# All Rights Reserved
# This program writes HTML files to a webserver folder by scraping google sheets urls
# 6/14/23
#####################################################################################
import pandas as pd
import os
from string import Template

site_path = "/home/hahn/Desktop/HahnAI/blog/"    
url_blog    = "https://docs.google.com/spreadsheets/d/12Aq-6jKjghX7TxJJPdAdVR8TfnImP5uZ2JhQYecjHK4/edit#gid=745755078"

def get_database(url):
    url_head = "https://docs.google.com/spreadsheets/d/"
    url_foot = "/gviz/tq?tqx=out:csv&sheet="
    url_body = url.split('/')[5]
    sheet_name = "1"
    url_csv = url_head + url_body + url_foot + sheet_name
    df = pd.read_csv(url_csv, sep=',', skiprows=0)
    return df
    
head = '''<!DOCTYPE HTML>
<html>
<head>
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
<p><span class="image left"><a href = 'blog$i.html'><img src="$image" alt="" /></a> </span>$content <a href = 'blog$i.html'>Read More</a></p>
'''

blog_foot = '''				
</div>
</section>
<br>
'''

foot = '''
<footer id="footer">
<div class="copyright">
&copy; MPCR Lab <a href="https://mpcrlab.com">Main Site</a>.
</div>
</footer>
<script src="assets/js/jquery.min.js"></script>
<script src="assets/js/jquery.scrolly.min.js"></script>
<script src="assets/js/skel.min.js"></script>
<script src="assets/js/util.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>'''


blog = Template(blog)

df_blog  = get_database(url_blog)

source_blog = head

for i in range(len(df_blog)):
    
    photo_url = "https://drive.google.com/uc?export=download&id=" + str(df_blog["Post Image"][i]).split('=')[1]
    
    source_blog += blog.substitute(i = i, title=df_blog["Post Title"][i],image=photo_url,content=df_blog["Post Text"][i][:300]) + blog_foot 


source_blog    += "<br><br><br><br><br><br>" +foot

            
print(source_blog,    file=open(site_path + "blog-1.html",    'w'))
print(source_blog,    file=open(site_path + "index.html",    'w'))



#####################################################################################
#####################################################################################
#####################################################################################

    
head = '''<!DOCTYPE HTML>
<html>
<head>
<title>Hahn AI</title>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="assets/css/main.css" />
</head>
<body onload="generateNavigation()">
<header id="header">
<a href="index.html" class="logo"><strong>Hahn</strong> AI</a>
</header>
'''

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
    let firstPage = baseURL + "blog-1.html";
    let lastPage = baseURL + "blog" + {last} + ".html"; 

    let navigationHTML = `
        <br><br><br><center><nav>
            <a href="${{firstPage}}" class="first">First</a>  |  
            <a href="${{prevPage}}" class="previous">Previous</a>  |  
            <a href="${{nextPage}}" class="next">Next</a>  | 
            <a href="${{lastPage}}" class="last">Last</a>
        </nav></center>
    `;

    // Add the navigation to the end of each section
    let sections = document.getElementsByTagName('section');
    for (let i = 0; i < sections.length; i++) {{
        sections[i].innerHTML += navigationHTML;
    }}
}}
</script>
</body>
</html>'''


for i in range(len(df_blog)):

    source_blog = head 
        
    photo_url = "https://drive.google.com/uc?export=download&id=" + str(df_blog["Post Image"][i]).split('=')[1]
    
    source_blog += blog.substitute(title=df_blog["Post Title"][i],image=photo_url,content=df_blog["Post Text"][i]) + blog_foot 

    source_blog    += "<br><br><br>" + foot
        
    print(source_blog,    file=open(site_path + f"blog{i}.html",    'w'))

    
#####################################################################################
    
os.chdir(site_path)    
os.system("git add . ")  
os.system("git commit -m 'update'")  
os.system("git push origin main ")    
    
    
    



    
    
    
    
    
    
    
    
    
    
