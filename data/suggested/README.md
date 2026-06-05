# Lista de PVP sugerido

Coloca aca el archivo `precios_sugeridos.csv` para que el scrape cruce los precios relevados contra la lista propia.

Columnas aceptadas:

- `super`: `Tata`, `Disco`, `El Dorado`, `Tienda Inglesa` o `todos`
- `sku`: opcional, recomendado cuando se conoce el codigo del supermercado
- `marca`: Los Sorchantes, Tia Rosa, Bimbo, Rapiditas, Artesano, Maestro Cubano, Merienda Hit, Merienda XL, Takis, Salmas o Nutrabien
- `producto`: nombre o descripcion del producto propio
- `pvp_sugerido`: precio teorico de venta al publico

El cruce usa primero `super + sku`. Si no hay SKU, usa `super + marca + tamano + similitud del nombre`.
