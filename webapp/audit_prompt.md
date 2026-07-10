I got this repo from my colleagues, but they are not SWE engineers. I installed a lot of skills. Make use of them.
I also installed caveman and rtk. Use them!
I want you to check this repo regarding:

- web design best practices (you have a skill for that)
- security best practices (you have a skill for that and also the AUTH_REVIEW_CHECKLIST.md from another repo)

Furthermore, I want you to look at this repo: https://github.com/TKlerx/webapp-template/
There is a lot in terms of SWE best practices:
pre commit / push hooks
code deduplication checks
e2e playwright tests
package retention of 7 days for uv and pnpm
semgrep
pnpm audit
and maybe even more.
Check it out and pick what you find useful.

A few notes: The colleagues used cosmos db for data storage. idk whether that is the best option. I did not find an ORM for cosmos db with python. So idk how to do proper migrations.
Eventually, we want to bring this code into production with CI/CD (with azure devops and running in azure) and some proper monitoring.

Now do your thing and check all of that. Also, I want to later document needed changes using github speckit.

Also do the following:

- Check for UI best practices
- Check for python best practices
- Do security review/audit
- migrate from next-auth to better-auth
- get rid of requirements.txt and use uv with proper pyproject.toml

If there is more stuff to consider, please let me know.

Document all findings in a markdown file.
