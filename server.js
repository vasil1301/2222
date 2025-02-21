// backend/server.js
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;

// Підключення до MongoDB (використовуємо ім'я сервісу "mongo" з docker-compose)
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const PostSchema = new mongoose.Schema({
    post_id: String,
    message: String,
    sentiment: String,
    created_time: Date,
});

const Post = mongoose.model('Post', PostSchema);

// Middleware для обробки JSON
app.use(bodyParser.json());

// Маршрут для отримання постів із Facebook
app.get('/api/facebook/posts', async (req, res) => {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const pageId = process.env.FB_PAGE_ID;
    const url = `https://graph.facebook.com/v14.0/${pageId}/posts?fields=message,created_time,comments{message}&access_token=${accessToken}`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Помилка при отриманні даних:', error.message);
        res.status(500).send('Не вдалося отримати дані з Facebook');
    }
});

// Маршрут для аналізу тексту (виклик Python‑сервісу)
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    try {
        // Виклик сервісу NLP через Docker‑мережу (контейнер nlp має ім'я "nlp")
        const response = await axios.post('http://nlp:5000/analyze-sentiment', { text });
        res.json(response.data);
    } catch (error) {
        console.error('Помилка при аналізі тексту:', error.message);
        res.status(500).send('Не вдалося виконати аналіз тексту');
    }
});

// Маршрут для збереження посту з аналізом
app.post('/api/save-post', async (req, res) => {
    const post = req.body;
    try {
        const analysisResponse = await axios.post('http://nlp:5000/analyze-sentiment', {
            text: post.message,
        });
        const sentiment = analysisResponse.data[0].label;

        const newPost = new Post({
            post_id: post.id,
            message: post.message,
            sentiment: sentiment,
            created_time: post.created_time,
        });
        await newPost.save();
        res.json({ message: 'Пост збережено успішно', sentiment });
    } catch (error) {
        console.error('Помилка збереження посту:', error.message);
        res.status(500).send('Не вдалося зберегти пост');
    }
});

// Маршрут для отримання всіх збережених постів
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find({});
        res.json(posts);
    } catch (error) {
        console.error('Помилка отримання постів:', error.message);
        res.status(500).send('Не вдалося отримати пости');
    }
});

// Інтеграція з Telegram (отримання оновлень)
app.get('/api/telegram/updates', async (req, res) => {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
    try {
        const response = await axios.get(`${TELEGRAM_API}/getUpdates`);
        res.json(response.data.result);
    } catch (error) {
        console.error('Помилка отримання даних з Telegram:', error.message);
        res.status(500).send('Не вдалося отримати дані з Telegram');
    }
});

app.listen(port, () => {
    console.log(`Сервер працює за адресою http://localhost:${port}`);
});
