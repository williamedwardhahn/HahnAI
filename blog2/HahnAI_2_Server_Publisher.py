# Hahn AI Blog Engine 2
# William Edward Hahn 
# All Rights Reserved
# This program writes HTML files to a webserver folder 
# 10/26/23
#####################################################################################
import pandas as pd
import os
from string import Template
import requests
from PIL import Image

main_folder_path = "/home/hahn/Desktop/HahnAI/blog2/"

image_path ="https://raw.githubusercontent.com/williamedwardhahn/HahnAI/main/blog/"

def blog(title,story,image_path):

	blog_page = f'''
	<!DOCTYPE HTML>
	<html>
	<head>
	<link rel="icon" type="image/png" href="../images/favicon-32x32.png" sizes="32x32" />
	<link rel="icon" type="image/png" href="../images/favicon-16x16.png" sizes="16x16" />
	<!-- Google tag (gtag.js) -->
	<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZDVLMSSQ0M"></script>
	<script> window.dataLayer = window.dataLayer || []; function gtag(){{dataLayer.push(arguments);}} gtag('js', new Date()); gtag('config', 'G-ZDVLMSSQ0M');
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

	<section id="main">
	<div class="inner">
	<h4>{title}</h4>
	<p><span class="image left"><img src="{image_path}" alt="" /></span>
	{story}
	</div>
	</section>
	<br>
	<br><br><br>
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
	</html>
	'''
	return blog_page

#####################################################################################
def publisher():

	print("Publishing...")

	data = {
		'Number': [],
		'Title':  [],
		'Story':  [],
		'Image_Paths': []
	}

	for subfolder in os.listdir(main_folder_path):
		if subfolder.isnumeric():
			subfolder_path = os.path.join(main_folder_path, subfolder)
			if os.path.isdir(subfolder_path):

				title = ''
				body = ''
				image_paths = []

				for filename in os.listdir(subfolder_path):
				    file_path = os.path.join(subfolder_path, filename)

				    if filename.endswith('.txt'):
				        with open(file_path, 'r') as f:
				            lines = f.readlines()
				            title = lines[0].strip()
				            body = ''.join(lines[1:]).strip()

				    elif filename.startswith('compressed') and filename.endswith(('.png', '.jpg', '.jpeg')):
				        image_paths.append(filename)

				data['Number'].append(subfolder)
				data['Title'].append(title)
				data['Story'].append(body)
				data['Image_Paths'].append(image_paths)

	df_blog = pd.DataFrame(data)
	
	os.chdir(main_folder_path)

	for i in reversed(range(len(df_blog))):
	
		number = df_blog['Number'][i]

		title = df_blog['Title'][i]

		story = df_blog['Story'][i]
		
		image_path = str(number) + '/' + df_blog['Image_Paths'][i][0]
		
		blog_html = blog(title,story,image_path) 
		
		print(blog_html, file=open(f"blog{number}.html", 'w'))
		
	
	print("...published")

#####################################################################################














































    



    
    
    
    
    
    
    
    
    
    
