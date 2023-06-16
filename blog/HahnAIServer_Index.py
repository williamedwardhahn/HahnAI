# SandboxDB Server v2
# William Edward Hahn
# All Rights Reserved
# This program writes HTML files to a webserver folder by scraping google sheets urls
#####################################################################################
import pandas as pd
import os
import pandas as pd
from string import Template


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
 

site_path = "/home/hahn/Desktop/HahnAI/blog/"    

#Google sheet urls

url_blog    = "https://docs.google.com/spreadsheets/d/12Aq-6jKjghX7TxJJPdAdVR8TfnImP5uZ2JhQYecjHK4/edit#gid=745755078"

df_blog     = get_database(url_blog)

source_blog = head #+ logo

#####################################################################################

for i in range(len(df_blog)):
    
    # if df_blog["Status"][i] == 1:
        
    photo_url = "https://drive.google.com/uc?export=download&id=" + str(df_blog["Post Image"][i]).split('=')[1]
    
    source_blog += blog.substitute(i = i, title=df_blog["Post Title"][i],image=photo_url,content=df_blog["Post Text"][i][:800]) + blog_foot 


source_blog    += "<br><br><br><br><br><br>" +foot

            
print(source_blog,    file=open(site_path + "blog-1.html",    'w'))
print(source_blog,    file=open(site_path + "index.html",    'w'))
    
    
os.chdir(site_path)    
os.system("git add . ")  
os.system("git commit -m 'update'")  
os.system("git push origin main ")    
    
    



    
    
    
    
    
    
    
    
    
    
