---
title: 8 Lessons From Consultancy
layout: post
---

Basically, there are no hard technical problems. The hard problems are all wetware related. Here's my idiosyncratic take on this stuff.

---

### Lesson 0: The human element matters most of all

Projects do not fail or succeed based on technical merits. In almost all projects I've been involved in, the success or failure of the project was down to human factors. Pay attention to human factors from the very first contact with the client, and especially to internal dynamics. Figure out what the influence graph looks like, and realise that it almost never looks like the org chart. In larger organisation, pay attention to the internal dynamics at the group level as well. Consultants are often brought in by one team to support their opinion or efforts against another internal team's alternative solution. Ask questions like "Are any other teams working on a similar project?" or "Has this been tried before by another team?". Politics is ugly, but will have far more of an impact on project outcome than technical matters. Being good at politics is a very useful skill. There's an entire book that could be written about Politics for Consultants.

### Lesson 1: Continuous improvement beats perfect design every time

Teams that excel don't start out that way. They get better over time by learning and improving. The single most important factor for a team's or a project's long term performance is whether they improve over time. Ask whether there is a continuous learning process in place. Do you perform retrospectives? Do you have a post-incident process in place to improve the system in cases of failure? Do you regularly ask: Can we do this better? This is true for both the human and technical elements. Baking this into the team's culture will pay back more long term dividends than almost anything else. As a consultant, my job is to make myself redundant, that means ensuring the client team continues to learn and grow in my absence. There are heavy-handed and process driven ways of doing this, or you can bake it into the culture. Either way, lack of collecting and acting on feedback is a sign of ill health, and it's higher value work to fix that than any other technical or tactical problems. There are two types of continuous improvement: Reactive and Proactive. This is a personal area of interest for me, I can talk about this stuff for hours if you let me. If you're really interested, I'd recommend a quick look at Peter Senge's work, the OODA loop and a dive into Agile principles (see The Art of Agile, Part III).

### Lesson 2: Make it work end-to-end as fast as you can.

My rule of thumb is as follows: Make it work, make it clean, make it fast, in that order. I've seen an antipattern where people are spending far too long designing an ideal architecture instead of delivering value. Ideally, you should be able to demonstrate real value within 2-3 weeks of beginning the work. If you're 6 or 12 months into your project and haven't delivered to your internal customers yet, it's a massive sign that things are badly wrong. Successful teams pushing for a cloud transformation have a strong bias for action and a sharp focus on their internal customers, who are involved from the very start of the project. This is basic Agile stuff, but people are still getting this wrong all the time. See Walking Skeleton or Tracer Bullet

### Lesson 3: Get compliance onboard at the start

There will be people in the company that have veto or final approval power over a project. Get these people involved as early as possible. If that's a senior leader, then get them involved early as well. If the project is well run, Compliance, Security, and Network Security teams should not be surprised and know exactly what they will review. It'll be a rubber stamping exercise on decisions they helped make. This might require educating these teams on cloud-native architectures and controls. Make sure that from the start, the project team has a warrant to act. If they don't, no matter how good the work or eager the team, it won't happen.

### Lesson 4: Document your requirements

You don't have to go overboard with this, but requirements should be documented. A good and fast way of doing this is define a bunch of user personas and user stories. It's lightweight, and doesn't speak on implementation. This lets you track scope creep and gives a good way to prioritise work while allowing requirement change. I'm basically advocating for agile by this point, but this is valid for waterfall projects too. No documented requirements means that nobody actually knows what they're supposed to do and is a personal warning flag. You can keep this super lightweight. I like markdown files in the project folder.

### Lesson 5: Define non-functional requirements concretely

In almost all situations, concrete > abstract. "It should be fault-tolerant" is a shitty requirement. Instead, outline the exact failure modes that should be tolerated. "The service should still be respond to all valid queries within 60s in case 30% of underlying machines become unavailable" is much more concrete. Getting the team to define non-functional requirements concretely will help avoid a disagreement on delivery, and it's much clearer to implement. This is mostly asking a questions in the form of "What do you mean by X?". You can cheat this process as a consultant and add "Do you mean {Thing I want you to say, because I know how to make it happen easily}?" and the answer will most often be yes. I also like defining fault tolerance by outlining concrete scenarios the system is supposed to survive, because that makes those requirements testable. Building for testability is almost always the right thing.

### Lesson 6: Document architectural decisions

Architectural decisions should be recorded, with links back to the requirements. This is easy to do with Architecture Decision Records. You can keep it super simple and simply drop a file in your repository. See a guide on GitHub for more details. This will help the team move forward and not spend ages vacillating over architecture. They're a good documentation format that's easy to digest, and the git log of the adr folder becomes a useful timeline of the project.

### Lesson 7: CI is not orchestration or automation

Don't use CI tools for orchestration and automation. They suck at this. It's always a pain to maintain, modify and use. Jenkins is not an automation tool! It's a build tool. Don't confound the two use cases. Software lifecycle management needs to hook into various places in the organisation, like marketing, security, product, and others. Alternatives I've seen to do this stuff are:
- The https://xebialabs.com/ tools
- Ansible Tower or its OSS brother AWX
- Argo workflows/pipelines.

While it's sometimes inevitable to use Jenkins or similar, (for a host of reasons), the decision should be made deliberately, not accidentally, and better tools should be evaluated first.

Hope that was useful. I didn't really intend to write this, it kind of just happened. I realise that none of this is about Kubernetes adoption or Gitops, but the truth is that the technology is almost irrelevant to actually succeeding. You can deliver successful, large scale projects with LAMP if you get the human side right, and the process and culture means that if the team needs a technological pivot to support a set of features, they'll do it naturally.
