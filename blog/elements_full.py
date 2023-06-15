###############################################################
###############################################################
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
    
#Alt is green, special is red
def S(x):
    return 'special' if x == '""' else 'alt' 



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


#banner = Template(banner)
#+ banner.substitute(title="Lab Members")
banner = '''
<section id="banner">
<div class="inner">
<h1>$title</h1>
</div>
</section>'''




###############################################################
###############################################################
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
<script>
function generateNavigation() {
    let currentURL = window.location.href;
    let baseURL = currentURL.substring(0, currentURL.lastIndexOf("/") + 1);
    let currentPage = currentURL.substring(currentURL.lastIndexOf("/") + 1);
    let currentPageNumber = parseInt(currentPage.replace(/\D/g,''));

    let prevPageNumber = currentPageNumber - 1;
    let nextPageNumber = currentPageNumber + 1;

    let prevPage = baseURL + "post" + prevPageNumber + ".html";
    let nextPage = baseURL + "post" + nextPageNumber + ".html";
    let firstPage = baseURL + "post1.html";
    let lastPage = baseURL + "post{last}" + ".html"; //replace {last} with your last page number

    let navigationHTML = `
        <nav>
            <a href="${firstPage}" class="first">First</a>
            <a href="${prevPage}" class="previous">Previous</a>
            <a href="${nextPage}" class="next">Next</a>
            <a href="${lastPage}" class="last">Last</a>
        </nav>
    `;

    // Add the navigation to the end of each section
    let sections = document.getElementsByTagName('section');
    for (let i = 0; i < sections.length; i++) {
        sections[i].innerHTML += navigationHTML;
    }
}
</script>
</body>
</html>'''





article_left = '''
<section id="main">
<div class="inner">
<section>		
<h4>$author - $title</h4>
<p><span class="image left"><img src="$image" alt="" style="border: 8px solid #000; max-width:300px; max-height:300px;"/></span>$text</p>
</section>
</div>
</section>
<br>
<br>
<br>
<br>
'''

article_right = '''
<section id="main">
<div class="inner">
<section>		
<h4>$author - $title</h4>
<p><span class="image right"><img src="$image" alt="" style="border: 8px solid #000; max-width:300px; max-height:300px;"/></span>$text</p>
</section>
</div>
</section>
<br>
<br>
<br>
<br>
'''


###############################################################
###############################################################
article = '''
<article id="one" class="post style1">
<div class="image">
<img src="$image" alt="" data-position="75% center" />
</div>
<div class="content">
<div class="inner">
<header>
<h2>$title</h2>
<p class="info">$author</p>
</header>
<p>$text</p>
</div>
</div>
</article>'''

###############################################################
###############################################################
###Alt is green, special is red
kanban = '''    
<section id="main">
<div class="inner">
<h4>$title - $author</h4> 
<ul class="actions">
<li><a href="$l1" class="button $s1">Abstract</a></li>
<li><a href="$l2" class="button $s2">Code</a></li>
<li><a href="$l3" class="button $s3">Experiments</a></li>
<li><a href="$l4" class="button $s4">Demo</a></li>
<li><a href="$l5" class="button $s5">Report</a></li>
<li><a href="$l6" class="button $s6">Publication</a></li>
</ul></section>
'''


###############################################################
###############################################################
journal_head = '''   
<section id="main">
<div class="inner">
<header class="major special">
<h1>Daily Standup Board</h1>
<p><br>Each team member updates their peers: <br><br>
1) What I have done since last meeting, <br>
2) What I am going to work on next, <br>
3) Obstacles that I need someone to remove<br><br>
</p>
</header>
<div class="table-wrapper">
<table class="alt">
<thead>
<tr>
<th>Name</th>
<th>Just Accomplished</th>
<th>Next Goal</th>
<th>Roadblocks</th>
</tr>
</thead>
<tbody>'''


journal = '''
<tr>
<td>$author</td>
<td>$yesterday</td>
<td>$today</td>
<td>$blocks</td>
</tr>'''


journal_foot = '''				
</tbody>
</table>
</div>
</section>
'''


###############################################################
###############################################################
blog = '''
<section id="main">
<div class="inner">
<h4>$title</h4>
<p><span class="image left"><img src="$image" alt="" /></span>$content</p>
'''

blog_foot = '''				
</div>
</section>
<br>
'''


logo = '''
<section id="main">
<div class="inner">
<div class="image fit">
<img src="https://mpcrlab.com/images/logos/MPCR-Captioned.jpeg" alt="" />
</div>
</section>
'''

###############################################################
###############################################################
about = '''
<section id="main">
<div class="inner">
<div class="image fit">
<img src="https://mpcrlab.com/images/logos/MPCR-Captioned.jpeg" alt="" />
</div>
<br>
<header>
<h1>What is the MPCR Lab?</h1>
</header>
<p>The Machine Perception and Cognitive Robotics Laboratory is a multidisciplinary research group dedicated to understanding the foundational mechanisms of intelligent systems. All projects and activities in the lab are focused towards building a model of the brain. At the core of our research is a custom simulation and machine learning platform that allows for perception-action experiments. Individuals and teams in the lab work on modules that they think are relevant towards that overall goal. Some of these modules will consist of 3D simulated environments, others modules will consist of theoretical components such as hypervectors, Cartesian frames, locally competitive algorithms or long short term memory networks.</p>
<br>
<header>
<h1>What does it mean to join the MPCR lab?</h1>
</header>
<p>
<ul>
<li>Work as a individual or on a small team to build a new BrAIn module</li>
<li>Show up to standup meetings held daily in the MPCR lab</li>
<li>Keep DeepZoo Dashboard updated</li>
<li>Prepare MPCR technical report documenting theories and experiments
<li>Submit a scientific publication to a journal or conference</li>
<li>Prepare a graduate or undergraduate thesis</li>

</ul> 
</p>
<br>
<header>
<h1>
How does one join?
</h1>
</header>
<p>
<ul>
<li>Register with the DeepZoo Dashboard </li>
<li>Participate in an MPCR bootcamp</li>
<li>Interview with Dr. Barenholtz, Dr. Schneider, and Dr. Hahn</li>
</ul> 
</p>
<br>
<header>
<h1>
What is a BrAIn Module?
</h1>
</header>
<p>
A module is a component of our BrAIn simulation. The goal is to build up model complexity one module at a time. Our baseline models are little more than an eye, a couple muscles, and a couple of neurons. From that baseline we add complexity in a number of different ways. This includes adding new sensors, new learning modules, and new environments. The number of ways you can help contribute to the project are almost endless! 
<br>
<ul>
<li>Eyes</li>
<li>Ears</li>
<li>Touch</li>
<li>Voices</li>
<li>Anatomical Brain Regions</li>
<li>Mathematical Model Components</li>
<li>Adaptive neuro fuzzy inference system</li>
</ul> 
</p>

<br>
<br>

<header>
<h1>
Dashboard Access
</h1>
</header>
<p>
<ul>
<li><a href = "https://docs.google.com/forms/d/e/1FAIpQLScEneFkjC8ixL-ab7mBI4PRfzU_BzTXeEkMRtK0pcOgfgx6gA/viewform?usp=sf_link">Register</a></li>
<li><a href = "https://docs.google.com/forms/d/e/1FAIpQLSeRXHQsGcRG2XVOmIWX2AOzdTvGEFizABlX0-nQdBbqFsEhwg/viewform?entry.1581145981=%22%22&entry.1518811151=%22%22&entry.272775372=%22%22&entry.1046361592=%22%22&entry.1798791761=%22%22&entry.1529170505=%22%22">Kanban</a></li>
<li><a href = "https://docs.google.com/forms/d/e/1FAIpQLSeMhVEAj7vJxLJSQ_hz8pgG1MObJxU5cGwJaESt9x6QsbSu4w/viewform?usp=sf_link">Journal</a></li>
<li><a href = "https://docs.google.com/forms/d/e/1FAIpQLSdtUd2rXDVrbFjqNpUh3eaJolidHaWxjf6Vr7g57FIEN9rTiQ/viewform?usp=sf_link">Blog</a></li>
</ul> 
<br>
Note: Content is updated every five minutes i.e. if you make a new blog post it will show up five minutes later.
</p>



</div>
</section>'''

###########################################################################

article = Template(article_left)
kanban  = Template(kanban)
blog    = Template(blog)
journal = Template(journal)































 
