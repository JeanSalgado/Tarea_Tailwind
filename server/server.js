const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

// Configura la conexión a PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'gaming.js',
  password: 'admin1',
  port: 5432,
});

// Middleware para permitir el acceso desde el frontend (CORS)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
const jwt = require('jsonwebtoken'); 
app.use(express.json());

// Token 
const JWT_SECRET ="ddRDQyAXG4LMiJnSvn7nELtdhw4h3sp834sPrzn47ckEee0iijDPsZDz7cXlnrtl"

// Ruta para obtener los productos
app.get('/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT prod_id, prod_nom, prod_desc, prod_estado, prod_ruta, prod_prec, prod_stock FROM public.productos');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener los productos', err);
    res.status(500).send('Error al obtener los productos');
  }
});

// Cargar datos usuario
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query('SELECT usua_id, usua_ced, usua_nom, usua_ape, usua_correo, "usua_url_fot", usua_rol FROM public.usuario');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener los usuarios', err);
    res.status(500).send('Error al obtener los usuarios');
  }
});

// Validacion de correo y contraseña de usuario
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM usuario WHERE usua_correo = $1', [username]);
    const user = result.rows[0];

    if (user) {
      if (password === user.usua_contra) {  // Comparación directa de la contraseña en texto plano
        const token = jwt.sign({ userId: user.usua_id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
      } else {
        res.status(401).send('Credenciales incorrectas');
      }
    } else {
      res.status(404).send('Usuario no encontrado');
    }
  } catch (error) {
    console.error('Error al autenticar al usuario', error);
    res.status(500).send('Error interno del servidor');
  }
});

// Verificar JWT (protege las rutas)
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send('Token no proporcionado');

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send('Token inválido');
    req.userId = decoded.userId;
    next();
  });
};

// Ruta protegida (solo accesible con token válido)
app.get('/protected', verifyToken, (req, res) => {
  res.send('Acceso concedido a contenido protegido');
});

app.post('/actualizar-stock', async (req, res) => {
  const productos = req.body.productos; // Array de productos con id y cantidad comprada
  const client = await pool.connect(); // Conexión a la base de datos

  try {
      await client.query('BEGIN'); // Iniciar transacción
      const resultados = [];

      // Iterar sobre los productos y actualizar el stock en la base de datos
      for (const producto of productos) {
          const { prod_id, cantidad } = producto;

          // Decrementar el stock del producto
          const queryText = 'UPDATE productos SET prod_stock = prod_stock - $1 WHERE prod_id = $2 AND prod_stock >= $1';
          const values = [cantidad, prod_id];

          // Ejecutar la consulta
          const result = await client.query(queryText, values);

          if (result.rowCount === 0) {
              // Si no se pudo actualizar, significa que no hay suficiente stock
              resultados.push({ prod_id, success: false, message: `No hay suficiente stock para el producto con ID: ${prod_id}` });
          } else {
              resultados.push({ prod_id, success: true, message: 'Stock actualizado exitosamente' });
          }
      }

      await client.query('COMMIT'); // Confirmar transacción

      // Responder con el resultado de cada producto
      res.status(200).json({ success: true, resultados });
  } catch (error) {
      await client.query('ROLLBACK'); // Revertir cambios en caso de error
      console.error('Error al actualizar el stock', error);
      res.status(500).json({ success: false, message: error.message });
  } finally {
      client.release(); // Liberar la conexión
  }
});

// Ruta para eliminar un producto
app.delete('/productos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM public.productos WHERE prod_id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar el producto', err);
    res.status(500).send('Error al eliminar el producto');
  }
});

// Ruta para editar un producto (todos los campos)
app.put('/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { prod_nom, prod_desc, prod_estado, prod_ruta, prod_prec, prod_stock } = req.body;
  try {
    const result = await pool.query(
      'UPDATE public.productos SET prod_nom = $1, prod_desc = $2, prod_estado = $3, prod_ruta = $4, prod_prec = $5, prod_stock = $6 WHERE prod_id = $7',
      [prod_nom, prod_desc, prod_estado, prod_ruta, prod_prec, prod_stock, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar el producto', err);
    res.status(500).send('Error al actualizar el producto');
  }
});

// Ruta para añadir stock a un producto
app.put('/productos/:id/stock', async (req, res) => {
  const { id } = req.params;
  const { additionalStock } = req.body;
  try {
    const currentStockResult = await pool.query('SELECT prod_stock FROM public.productos WHERE prod_id = $1', [id]);
    if (currentStockResult.rowCount === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    const currentStock = currentStockResult.rows[0].prod_stock;
    const newStock = currentStock + additionalStock;

    await pool.query('UPDATE public.productos SET prod_stock = $1 WHERE prod_id = $2', [newStock, id]);
    res.json({ message: 'Stock actualizado exitosamente', newStock });
  } catch (err) {
    console.error('Error al añadir stock', err);
    res.status(500).send('Error al añadir stock');
  }
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});





