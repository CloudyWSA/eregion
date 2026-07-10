# @eregion/angular

Integração do Eregion (SDK de edição visual com IA) para apps **Angular** em
desenvolvimento. Registra o adapter Angular, monta o overlay de seleção + o
chat e pede ao daemon o índice estático de componentes.

Não depende de `@angular/core` — a ativação é uma chamada de função no `main.ts`.

## Uso

Chame `initEregion()` **uma vez**, depois do bootstrap da aplicação:

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { initEregion } from '@eregion/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
  .then(() => initEregion())
  .catch((err) => console.error(err));
```

`initEregion()`:

- é **no-op fora de dev** — só executa quando `ngDevMode` ou `window.ng`
  (API de debug do Angular) estão presentes, então pode ficar no `main.ts`
  sem afetar o build de produção;
- é idempotente (montar duas vezes reaproveita o overlay já montado);
- pede o índice de componentes ao daemon (`angular.index.get`) e o carrega em
  memória para resolver as seleções para `arquivo:linha`.

Aceita opcionalmente `MountOptions` (ex.: `{ appName: 'meu-app' }`).

## Como funciona

`window.ng.getOwningComponent(el)` dá a instância do componente dono do
elemento clicado; o adapter cruza `className + selector` com o índice estático
(construído pelo daemon com ts-morph, sem tocar no build do app) para achar o
arquivo-fonte. Colisões de chave são desambiguadas pela árvore do DOM.
