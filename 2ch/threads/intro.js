app.setThreadData({
    "title": "【公告】关于本生成器的使用说明",
    "posts": [
        {
            "number": 1,
            "name": "管理员",
            "date": "2024/01/01(Mon) 00:00:00.00",
            "uid": "ID:Admin001",
            "body": "欢迎使用「所长的谣言板」生成器！\n\n这是一个完全本地运行的 2ch 风格论坛生成器，无需服务器。\n\n<b>基本使用方法：</b>\n1. 在 threads/ 目录下创建 JS 文件\n2. 在 threads/index.js 中注册帖子\n3. 打开 index.html 即可查看\n\n详细指南见下方楼层。"
        },
        {
            "number": 2,
            "name": "管理员",
            "date": "2024/01/01(Mon) 00:01:00.00",
            "uid": "ID:Admin001",
            "body": "<b>【第一步】创建帖子文件</b>\n\n在 threads/ 目录下创建一个 .js 文件，例如 threads/my_story.js\n\n模板：\napp.setThreadData({\n  \"title\": \"帖子标题\",\n  \"posts\": [\n    {\n      \"number\": 1,\n      \"name\": \"風吹けば名無し\",\n      \"date\": \"2030/07/12(Fri) 23:14:56\",\n      \"uid\": \"ID:AbCdEfGh\",\n      \"body\": \"正文内容\\\\n换行用 \\\\\\\\n\"\n    }\n  ]\n});\n\n<div class=\"fake-trans\">提示：date 字段的星期会自动转换为日语曜日格式（Fri → 金）</div>"
        },
        {
            "number": 3,
            "name": "管理员",
            "date": "2024/01/01(Mon) 00:02:00.00",
            "uid": "ID:Admin001",
            "body": "<b>【第二步】注册到目录</b>\n\n打开 threads/index.js，添加你的帖子：\n\n{\n  \"id\": \"my_story\",  // 必须与文件名一致\n  \"title\": \"帖子标题\",\n  \"count\": 1,  // 楼层数\n  \"date\": \"2030/07/12(Fri) 23:14:56\"  // 首楼时间\n}\n\n<b>【格式技巧】</b>\n• 安价链接：&gt;&gt;1 会自动变成可点击的链接\n• 翻译效果：&lt;div class=\"fake-trans\"&gt;翻译内容&lt;/div&gt;\n• 红字/加粗：支持 HTML 标签如 &lt;b&gt; 和 &lt;span style=\"color:red\"&gt;"
        }
    ]
});
