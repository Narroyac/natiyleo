# Componentes reutilizables — Pasaporte de Boda (fase 3, rediseño UI)

Todos viven en `components.css` y consumen `tokens.css`. Ninguno define
color/tipografía/radio propio — si algo se ve mal, el ajuste va en
`tokens.css`, no acá.

## greeting

Bloque de saludo: nombre + bienvenida en serif navy, subtítulo en sans.

```html
<div class="greeting">
  <p class="greeting-name">{Nombre},</p>
  <h1 class="greeting-title">¡Bienvenido(a) a nuestra boda!</h1>
  <p class="greeting-sub">Te invitamos a llenar tu pasaporte, ¡los 3 primeros en completarlo se llevarán un premio!</p>
</div>
```

## progress-bar

Barra fija con contador de estampillas (no de páginas). Agregar la clase
`pulse` al `.progress-fill` momentáneamente para la micro-animación al
llenarse un tramo.

```html
<div class="progress-bar">
  <div class="progress-track"><div class="progress-fill" style="width:18%"></div></div>
  <div class="progress-counter">2/11</div>
</div>
```

## nav-arrow

Botón circular flotante a los costados del libro. `disabled` lo oculta
(en la portada, por ejemplo, no hay flecha "anterior").

```html
<button class="nav-arrow" aria-label="Página anterior">‹</button>
<button class="nav-arrow" aria-label="Página siguiente">›</button>
```

## btn-secondary

Botón ancho, fondo crema con borde navy. Usado como enlace ("Ver galería
de fotos") o como botón de acción.

```html
<a class="btn-secondary" href="galeria.html">Ver galería de fotos</a>
```

## info-banner

Banner navy de ancho completo con acción circular a la derecha.

```html
<div class="info-banner">
  <p>Nos encontraremos en el Club el Prado. Aquí compartiremos tanto la ceremonia como la recepción.</p>
  <button class="info-banner-action" aria-label="Ir">›</button>
</div>
```

## stamp-slot

Recuadro de estampilla, borde punteado tipo estampilla postal. Dos
estados:

- **Pendiente** (default): fondo `--slot`, label + botón circular "+"
  (es el call-to-action del reto — todo el recuadro es tappable).
- **Sellado** (`.is-done`): sin fondo/borde, muestra la ilustración de la
  estampilla a tamaño completo. Agregar `.is-stamping` momentáneamente
  (se quita solo, es una animación de 0.4s) para el efecto de sellado
  cuando se acaba de completar.

```html
<!-- pendiente -->
<button class="stamp-slot" data-challenge-id="...">
  <span class="stamp-slot-label">RSVP</span>
  <span class="stamp-slot-btn">＋</span>
</button>

<!-- sellado -->
<button class="stamp-slot is-done" data-challenge-id="...">
  <img class="stamp-slot-img" src="..." alt="RSVP" />
</button>
```

## passport-book

El marco del libro: borde navy grueso, esquinas redondeadas, sombra
suave, fondo papel. Es el contenedor de las páginas que giran con el
page-flip (ver `passport.css` para el motor de la animación, específico
del pasaporte y no reutilizable en otras pantallas).

```html
<div class="passport-book" id="passport-book">
  <!-- páginas del libro acá dentro -->
</div>
```

## Ya migrados de fases anteriores

El feed de galería, los chips de filtro, la barra de reacciones y los
comentarios (fase 2) ya consumían `tokens.css` desde que se construyeron
— no tenían valores propios que migrar. Se revisaron en esta fase y
siguen sin cambios de color/tipografía/radio fuera del sistema de tokens.
