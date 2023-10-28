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
import numpy as np
import string
import requests
import openai
openai.api_key = "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"

def talk(prompt):
	response = openai.ChatCompletion.create(
		model="gpt-4",
		messages=[
			{"role": "system", "content": system_prompt},
			{"role": "user", "content": prompt}
		]
	)
	return response.choices[0].message['content']

def draw(image_prompt,N=10):
	image_resp = openai.Image.create(prompt=image_prompt, n=N, size="512x512")
	N = len(image_resp['data'])
	for i in range(N):
		url = image_resp['data'][i]['url']
		response = requests.get(url)
		if response.status_code == 200:
			with open(f'image{np.random.randint(8**8)}.jpg', 'wb') as f:
				f.write(response.content)

def create_next_numbered_folder(target_directory):
	folder_names = [name for name in os.listdir(target_directory) if os.path.isdir(os.path.join(target_directory, name))]
	numerical_folders = [int(folder) for folder in folder_names if folder.isnumeric()]
	highest_number = (max(numerical_folders) if numerical_folders else 0) + 1
	new_folder_path = os.path.join(target_directory, str(highest_number))
	os.makedirs(new_folder_path)
	return new_folder_path,highest_number
	
def compress_image(image_path):
    if os.path.getsize(image_path) > 0:  # Check if file is not empty
        picture = Image.open(image_path).convert("RGB")
        picture.save("compressed_" + image_path, "JPEG", optimize=True, quality=30)
    else:
        print(f"Image file {image_path} is empty. Skipping compression.")

def compress_all_images_in_current_folder():
    files = os.listdir()
    image_files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    for image_file in image_files:
        compress_image(image_file)


###################################################################################################################

main_folder_path = "/home/hahn/Desktop/HahnAI/blog2/"

image_path ="https://raw.githubusercontent.com/williamedwardhahn/HahnAI/main/blog/"

system_prompt = '''
You are a professional science writer with years of experience in communicating complex scientific topics to a broad audience. 
Your task is to write a compelling article about the given topic. 
Utilize a clear, engaging writing style, incorporating reputable sources and real-world examples to substantiate your points. 
Aim to not only inform but also captivate your readers, making them eager to learn more about the subject. 
Your article should have a compelling introduction, a substantive body with organized sections, 
and a strong conclusion that ties everything together, but don't use old fashioned phrases like ' In conclusion,' etc. 
(put <br><br> for paragraph breaks and <b> for bolding titles and subtitles)
'''
	
###################################################################################################################

def writer(topic):

	new_folder_path,blog_number = create_next_numbered_folder(main_folder_path)

	os.chdir(new_folder_path)

	print(f"New folder created: {new_folder_path}")

	print("Writing story about " + topic)

	story = talk(topic)

	print(story, file=open(f"blog{blog_number}.txt", 'w'))

	print("Creating images about " + topic)

	draw(topic)

	print("Compressing images...")

	compress_all_images_in_current_folder()

	print("...done writing")

###################################################################################################################




























