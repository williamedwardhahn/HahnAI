# SandboxDB Server v2
# William Edward Hahn
# All Rights Reserved
# This program writes HTML files to a webserver folder by scraping google sheets urls
#####################################################################################
import pandas as pd
import os
from elements_full import *

site_path = "/home/hahn/Desktop/HahnAI/blog/"    

#Google sheet urls

url_blog    = "https://docs.google.com/spreadsheets/d/12Aq-6jKjghX7TxJJPdAdVR8TfnImP5uZ2JhQYecjHK4/edit#gid=745755078"

df_blog     = get_database(url_blog)



#####################################################################################

for i in range(len(df_blog)):

    source_blog = head + logo
    
    # if df_blog["Status"][i] == 1:
        
    photo_url = "https://drive.google.com/uc?export=download&id=" + str(df_blog["Post Image"][i]).split('=')[1]
    
    source_blog += blog.substitute(title=df_blog["Post Title"][i],image=photo_url,content=df_blog["Post Text"][i]) + blog_foot 

    source_blog    += "<br><br><br>" +foot
        
    print(source_blog,    file=open(site_path + f"blog_{i}.html",    'w'))
    
    
os.chdir(site_path)    
os.system("git add . ")  
os.system("git commit -m 'update'")  
os.system("git push origin main ")    
    
    



    
    
    
    
    
    
    
    
    
    
