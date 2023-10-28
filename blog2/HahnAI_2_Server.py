# Hahn AI Blog Engine 2
# William Edward Hahn 
# All Rights Reserved
# This program writes HTML files to a webserver folder 
# 10/26/23
#####################################################################################
from HahnAI_2_Server_Writer import *
from HahnAI_2_Server_Publisher import *
#####################################################################################

topics = ["Animal Language and AI",
		  "Optical Computers",
		  "Sandwich 3D Printers"]

for topic in topics:

#	writer(topic)

	publisher()


#####################################################################################
# Push to GitHub
#####################################################################################    
os.system("git add . ")
os.system("git add .. ")    
os.system("git commit -m 'update'")  
os.system("git push origin main") #--force    
    
    
















    



    
    
    
    
    
    
    
    
    
    
