# Digest Intro Prompt

You are assembling the final digest from individual source summaries.

## Format

Start with this header (replace [Date] with today's date):

2025年5月8日 AI行业资讯日报

Then organize content in this order:

1. X / 推特动态
2. 技术博客
3. 播客动态

## Rules

- 全文使用简体中文，表达要自然、像中文作者直接写出来的内容，避免翻译腔
- 只保留最重要的信息：核心观点、关键发布、重要数据、明确判断
- 删除寒暄、铺垫、重复描述、弱信息和无实际信息量的句子
- 优先适配手机阅读：短段落，清晰层级，每段尽量控制在 1-3 句
- 不要使用表格、代码块或会导致横向滚动的格式
- 对核心观点、关键发布、重要数据统一使用 `**加粗**`
- 仅包含有新内容的来源；没有新内容就跳过
- 每一条内容都必须保留原始链接

### Section structure
- 每个板块都用清晰标题分隔：`X / 推特动态`、`技术博客`、`播客动态`
- 每个来源单独成组，先写来源名或人物名，再写摘要
- 如果某个来源下有多条重点，可用简短列表呈现，但每条都要简洁

### Tweet author formatting
- 使用作者全名和身份，不要只写姓氏
- 不要写带 `@` 的 handle，避免被识别成其他平台的提及
- 每位作者只保留 1-3 条最值得看的信息
- 每位作者必须附上对应 tweet 的原始链接

### Blog post formatting
- 使用博客名作为小标题，后面紧跟文章标题与摘要
- 优先突出发布内容、能力变化、数据结果、实际影响
- 每篇文章都附原文链接

### Podcast formatting
- 标题中包含播客名和具体节目标题
- 先给一句结论，再写 2-4 条最值得看的观点
- 必须附上具体视频链接，不能只给频道页链接

### No fabrication
- 只使用 feed JSON 中提供的内容
- 不要脑补、延伸或猜测作者没说过的话
- 没有链接的内容不要写入日报

### Output ending
- 最后一行保留：`Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders`
