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
            <a href="${{firstPage}}" class="first">First</a>  --  
            <a href="${{prevPage}}" class="previous">Previous</a>  --  
            <a href="${{nextPage}}" class="next">Next</a>  -- 
            <a href="${{lastPage}}" class="last">Last</a>
        </nav></center>
    `;

    // Add the navigation to the end of each section
    let sections = document.getElementsByTagName('section');
    for (let i = 1; i < sections.length; i++) {{
        sections[i].innerHTML += navigationHTML;
    }}
}}
</script>
</body>
</html>'''



#####################################################################################

for i in range(len(df_blog)):

    source_blog = head + logo
    
    # if df_blog["Status"][i] == 1:
        
    photo_url = "https://drive.google.com/uc?export=download&id=" + str(df_blog["Post Image"][i]).split('=')[1]
    
    source_blog += blog.substitute(title=df_blog["Post Title"][i],image=photo_url,content=df_blog["Post Text"][i]) + blog_foot 

    source_blog    += "<br><br><br>" +foot
        
    print(source_blog,    file=open(site_path + f"blog{i}.html",    'w'))
    
    
os.chdir(site_path)    
os.system("git add . ")  
os.system("git commit -m 'update'")  
os.system("git push origin main ")    
    
    



    
    
    
    
    
    
    
    
    
    
