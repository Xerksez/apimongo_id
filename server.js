const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require("fs");
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); // ścieżka do twojego pliku swagger.json

const app = express();
const port = 3000;

app.use('/swag', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


const mongoUrl = 'mongodb://localhost:27017'; // Tutaj podaj adres swojej bazy danych MongoDB
const dbName = 'productsDB'; // Tutaj podaj nazwę swojej bazy danych
const collectionName = 'products';

app.use(express.json());

const client = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

client.connect()
    .then(async () => {
        console.log('Połączenie z bazą danych udane');
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        const result = await collection.deleteMany({});
        console.log(`${result.deletedCount} produkty zostały usunięte z kolekcji.`);

        // Sprawdź, czy kolekcja jest pusta
        const count = await collection.countDocuments();
        if (count === 0) {
            const data = fs.readFileSync('products.json', 'utf8');
            const productsData = JSON.parse(data);

            // Wstaw dokumenty do kolekcji
            const result = collection.insertMany(productsData);

            console.log(`${result.insertedCount} produkty zostały dodane do kolekcji.`);
        } else {
            console.log('Kolekcja już zawiera produkty, pomijam dodawanie.');
        }

        // Przykład: Pobierz wszystkie produkty z kolekcji "products"
        app.get('/products', async (req, res) => {
            try {
                const { name, minPrice, maxPrice, minQuantity, maxQuantity } = req.query;

                // Utwórz obiekt z warunkami filtra na podstawie parametrów zapytania
                const filter = {};
                if (name) {
                    filter.name = { $regex: new RegExp(name, 'i') }; // Użyj wyrażenia regularnego dla wyszukiwania niezależnego od wielkości liter
                }
                if (minPrice) {
                    filter.price = { $gte: parseFloat(minPrice) };
                }
                if (maxPrice) {
                    filter.price = { ...filter.price, $lte: parseFloat(maxPrice) };
                }
                if (minQuantity) {
                    filter.quantity = { $gte: parseInt(minQuantity) };
                }
                if (maxQuantity) {
                    filter.quantity = { ...filter.quantity, $lte: parseInt(maxQuantity) };
                }


                const products = await db.collection('products').find(filter).toArray();

                const formattedProducts = products.map(({ _id, ...rest }) => rest);
                res.json(formattedProducts);

            } catch (error) {
                console.error('Błąd podczas pobierania produktów:', error);
                res.status(500).send('Błąd serwera');
            }
        });


        // Dodaj tutaj ścieżki i obsługę żądań dla twojego projektu Express
        app.post('/products', async (req, res) => {
            try {
                const {id, name, price, description, quantity, unit } = req.body;

                // Sprawdź, czy nazwa produktu jest unikalna
                const existingProduct = await collection.findOne({ name: name });
                if (existingProduct) {
                    return res.status(400).json({ error: 'Produkt o podanej nazwie już istnieje.' });
                }

                // Dodaj nowy produkt do kolekcji
                const result = await collection.insertOne({id, name, price, description, quantity, unit });

                console.log(`Dodano nowy produkt: ${name}`);
                res.status(201).json({ message: 'Produkt dodany pomyślnie.' });
            } catch (error) {
                console.error('Błąd podczas dodawania produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        app.put('/products/:id', async (req, res) => {
            try {
                const productId = req.params.id;
                const { name, price, description, quantity, unit } = req.body;

                const existingProduct = await db.collection('products').findOne({ id: parseInt(productId) });

                if (!existingProduct) {
                    return res.status(404).json({ error: 'Produkt o podanym identyfikatorze nie istnieje.' });
                }

                const updateResult = await db.collection('products').updateOne(
                    { id: parseInt(productId) },
                    {
                        $set: {
                            name: name || existingProduct.name,
                            price: parseFloat(price) || existingProduct.price,
                            description: description || existingProduct.description,
                            quantity: parseInt(quantity) || existingProduct.quantity,
                            unit: unit || existingProduct.unit,
                        },
                    }
                );

                if (updateResult.modifiedCount > 0) {
                    console.log(`Zaktualizowano produkt o identyfikatorze ${productId}`);
                    res.json({ message: 'Produkt zaktualizowany pomyślnie.' });
                } else {
                    console.log(`Nie dokonano zmian w produkcie o identyfikatorze ${productId}`);
                    res.json({ message: 'Brak zmian w produkcie.' });
                }
            } catch (error) {
                console.error('Błąd podczas aktualizacji produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });


        app.delete('/products/:id', async (req, res) => {
            try {
                const productId = req.params.id;

                const existingProduct = await db.collection('products').findOne({ id: parseInt(productId) });

                if (!existingProduct) {
                    return res.status(404).json({ error: 'Produkt o podanym identyfikatorze nie istnieje.' });
                }

                const deleteResult = await db.collection('products').deleteOne({ id: parseInt(productId) });

                if (deleteResult.deletedCount > 0) {
                    console.log(`Usunięto produkt o identyfikatorze ${productId}`);
                    res.json({ message: 'Produkt usunięty pomyślnie.' });
                } else {
                    console.log(`Nie usunięto produktu o identyfikatorze ${productId}`);
                    res.status(500).json({ error: 'Błąd podczas usuwania produktu.' });
                }
            } catch (error) {
                console.error('Błąd podczas usuwania produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        app.get('/inventory-report', async (req, res) => {
            try {
                const pipeline = [
                    {
                        $group: {
                            _id: null,
                            totalQuantity: { $sum: "$quantity" },
                            totalValue: { $sum: { $multiply: ["$quantity", "$price"] } }
                        }
                    }
                ];

                const reportResult = await db.collection('products').aggregate(pipeline).toArray();

                if (reportResult.length > 0) {
                    res.json({
                        totalQuantity: reportResult[0].totalQuantity,
                        totalValue: reportResult[0].totalValue
                    });
                } else {
                    res.json({
                        totalQuantity: 0,
                        totalValue: 0
                    });
                }
            } catch (error) {
                console.error('Błąd podczas generowania raportu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        // Uruchom serwer Express
        app.listen(port, () => {
            console.log(`Serwer Express działa na http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('Błąd połączenia z bazą danych:', err);
    });
