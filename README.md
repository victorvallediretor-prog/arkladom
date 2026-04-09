# ARKLADOM - Beta Fase 1

Implementação mínima funcional focada em **estrutura da mesa** e **sincronização em tempo real**.

## O que esta fase entrega

- Sistema de sala com criação pelo Mestre (host) e entrada de jogadores.
- Sincronização da mesa via Socket.IO.
- Reconexão por sessão persistida em `localStorage`.
- Estrutura da mesa com:
  - slot de chefe,
  - fileira de inimigos 2,
  - fileira de inimigos 1,
  - fileira de personagens,
  - grid de formação 3-4-3,
  - área de mão do jogador,
  - slots fixos do jogador.
- Turno simples (iniciar/avançar turno) controlado pelo Mestre.
- Movimentação de avatares no grid 3-4-3 (jogador move o próprio; Mestre move qualquer um).

> Esta fase **não implementa combate completo** e usa placeholders visuais.

## Estrutura do projeto

- `server.js`: backend (salas, sync em tempo real, reconexão, turnos, movimento de avatar).
- `public/index.html`: estrutura de UI da mesa e lobby.
- `public/app.js`: lógica cliente (socket, render, reconexão).
- `public/styles.css`: estilos placeholder do beta.
- `package.json`: scripts e dependências.

## Requisitos

- Node.js 18+

## Como rodar localmente

1. Instale dependências:

```bash
npm install
```

2. Inicie o servidor:

```bash
npm start
```

3. Acesse:

- `http://localhost:3000`
- `http://localhost:3000/health` (status do backend)

4. Fluxo recomendado de teste manual:

- Abra uma aba para o Mestre e clique em **Criar sala (Mestre)**.
- Abra outra aba/janela e entre com o mesmo código em **Entrar como jogador**.
- Teste:
  - sincronização dos elementos,
  - movimentação de avatares no grid,
  - iniciar/avançar turnos pelo Mestre,
  - refresh da página para validar reconexão automática.
