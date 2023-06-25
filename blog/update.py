import os
site_path = "/home/hahn/Desktop/HahnAI/blog/"
os.chdir(site_path)    
os.system("git add . ")  
os.system("git add .. ")  
os.system("git commit -m 'update'")  
os.system("git push origin main --force")   

#git push origin main --force
