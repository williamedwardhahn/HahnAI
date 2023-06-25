import os

# Get list of files in current directory
files = os.listdir('.')

# HTML page start
html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Index</title>
</head>
<body>
    <h1>Index</h1>
    <ul>
"""

# Add each file to HTML content
for file in files:
    if os.path.isfile(file) and file != "index.html":
        html_content += '        <li><a href="./{0}">{0}</a></li>\n'.format(file)

# HTML page end
html_content += """
    </ul>
</body>
</html>
"""

# Write HTML content to index.html
with open('index.html', 'w') as f:
    f.write(html_content)

print("index.html has been created.")

