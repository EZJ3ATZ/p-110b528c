# Matheus & Clara

Um pequeno jogo sobre distância.

Você caminha como Matheus. Clara caminha por conta dela.
Não existe pontuação, nem fases, nem vitória — o mundo inteiro apenas responde
à distância entre os dois:

| longe                          | perto                                   |
| ------------------------------ | --------------------------------------- |
| o dia vai embora, esfria       | amanhece                                |
| chuva, vento, folhas secas     | sol, borboletas, pássaros               |
| as cores somem                 | o campo floresce em volta deles          |
| música baixa e triste          | a música abre, entra um dedilhado        |

Feito com HTML, CSS e JavaScript puro. Sem frameworks, sem bibliotecas,
sem nenhum arquivo de imagem ou de áudio — o cenário é desenhado no `<canvas>`
e a trilha é sintetizada ao vivo pela Web Audio API.

## Como jogar

**Celular:** encoste na tela para caminhar até ali. Os botões **olhar** e
**dar a flor** aparecem sozinhos quando fazem sentido.
**Computador:** setas ou WASD para caminhar, **espaço** para olhar para ela,
**E** para dar a flor. `P` pausa · `M` música · `F` tela cheia.

São **oito escolhas**, uma por toque, em uns dois minutos:

- Ela fala, você responde.
- Entre as falas vêm os gestos: **flor**, **cheeseburger**, **beijo na testa**.
- No meio do caminho **alguém aparece** e puxa conversa com ela — se você não
  for até lá, o campo esfria.
- A última escolha é **dela**: perdoar e ficar, ou seguir o outro caminho.
  Uma leva ao casamento; a outra, à vida que veio depois.

## Arquivos

```
index.html      estrutura e telas
style.css       interface (mínima, feita para celular)
world.js        céu, luz, árvores, flores, rio, memórias, clima
particles.js    folhas, chuva, vaga-lumes, borboletas, partículas
characters.js   Matheus (você) e Clara (que decide sozinha)
audio.js        trilha sonora gerada no navegador
game.js         câmera, conexão invisível, frases e os três finais
```

## Publicar

O jogo é totalmente estático: basta jogar a pasta em qualquer hospedagem.
No GitHub Pages, o repositório precisa ser público, com o `index.html` na raiz
da branch `main` e o Pages ligado em *Settings → Pages → Deploy from a branch*.
