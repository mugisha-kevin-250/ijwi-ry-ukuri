const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/studentnews').then(async () => {
  require('./src/models/Article');
  const Article = mongoose.model('Article');
  const articles = await Article.find({ featuredImage: { $regex: 'localhost:5000' } });
  console.log('Found articles with absolute URLs:', articles.length);
  for (const article of articles) {
    article.featuredImage = article.featuredImage.replace(/^https?:\/\/[^/]+/, '');
    await article.save();
    console.log('Fixed:', article._id, article.title, '->', article.featuredImage);
  }
  mongoose.disconnect();
  console.log('Done');
}).catch(err => { console.error(err); process.exit(1); });