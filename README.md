# HahnAI

The public site for **[will.hahn.ai](https://will.hahn.ai)**, served by GitHub Pages from `main` (root).

This repo holds **built output only**. Posts are written and published by the private
[HahnAI_Server](https://github.com/williamedwardhahn/HahnAI_Server) repo, whose
`--approve` step syncs its `blog/` folder into this one. Don't hand-edit `blog/N/`;
change the server templates and republish.

## Layout

    index.html       Home page (HTML5 UP template, assets/ and images/)
    blog/            Current blog: index.html + one folder per post (N/index.html, image.jpg, meta.json)
    blog2/           Archive of the 2023 blog, kept so old links still work
    demos/           Standalone interactive demos (Solresol, color naming, watermark, piano)
    CNAME            will.hahn.ai

Never commit keys, `.env` files or Python scripts here: the repo is public.
