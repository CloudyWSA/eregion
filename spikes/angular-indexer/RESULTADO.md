# Spike: indexer Angular contra um app real (resultados sanitizados)

O spike original rodou contra um monorepo Angular 20 interno de grande porte.
Os artefatos com nomes/paths reais foram removidos para a publicação; ficam
os números e as conclusões, que fundamentam o design do indexer no daemon
(`packages/daemon/src/angular-indexer.ts`) e do adapter-angular.

- **889 componentes/diretivas** indexados em ~18s (ts-morph, sem tocar no build do app); selector extraído em 99,6%.
- A chave `{className + selector}` NÃO é única em apps reais: 36 grupos de colisão (16 entre apps do mesmo monorepo, **20 intra-app irredutíveis**, pior caso um mesmo modal copiado em 16 lugares).
- Conclusão de design: chave = `{projeto} + {selector} + ancestrais no DOM`, com `className` como sinal auxiliar.
- Matching de template (elemento clicado → arquivo.html:linha:coluna): 3/3 casos, incluindo `@if` novo e `*ngIf` legado — exige desembrulhar o `<ng-template>` sintético do desugaring de diretivas estruturais.
