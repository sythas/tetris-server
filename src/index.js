// The websocket livrary provides a server capable of handling websocket connections.
// A websocket is a persistant server connection that allows duplex messaging.
const WebSocket = require("ws");

// cuid library generates unique ids
const cuid = require("cuid");

// create an instance of the websocket server.  This will accept the client connections.
const server = new WebSocket.Server({ port: 8080 });

// these areas are used for storing the server state
const sockets = [];
const lounge = [];
const games = [];

//  These are functions designed to process a message received from the client.
//  The function name corresponds to the messages type property.
const handlers = {};

// This function handles the initial login of a client assigning thier name to the
// connection and placing them in the lounge to await being paired for a game.
handlers.login = (socket, message) => {
  console.log("logged in " + message.name);

  // save player name on the connection
  socket.name = message.name;

  // send a response to the login message
  socket.send({ type: "loggedIn", name: message.name });

  // enqueue the player in the lounge for entry into a game
  lounge.push(socket);
};

// End handles the end of the game.  It sends notifications of how the players did and
// thier standings.
handlers.end = (socket, message) => {
  // save game points for this player
  socket.points = message.points;

  // count this game completed
  socket.activeGame.completed += 1;

  // If the number of completed games matches the number of players
  if (socket.activeGame.completed >= socket.activeGame.players.length) {
    // sort all games by thier score
    const results = socket.activeGame.players.sort(
      (a, b) => b.points - a.points
    );

    // determine the high score
    const high = results[0].points;

    // create a list of everyones scores and names for the standings.
    const standings = results.map(player => ({
      name: player.name,
      points: player.points
    }));

    // send the status updates to the players including thier win/loss message and
    // the player standings
    results.forEach(player => {
      player.send({
        type: "result",
        outcome:
          player.points === high
            ? "Congratulations, you are the Tetris master!"
            : "Seriously, thats all you got?",
        standings
      });
    });
  }
};

// when the server receives a connection
server.on("connection", socket => {
  console.log("Connected Socket....");

  // Monkey Patching, ewwwy!!
  // This can be bad if used haphazardly.  The reason that it's bad is because it's
  // highjacking the original sockets send function, replacing it with one that
  // works differently.  If this codebase was shared with multiple developers, everyone
  // would need to know how the new function works to use it properly.  There are also
  // timing issues since the function works differently before and after this section.
  socket._send = socket.send;
  socket.send = msg => socket._send(JSON.stringify(msg));
  sockets.push(socket);

  // when a message is received on this specific socket
  socket.on("message", message => {
    // parse the string message back into a js object
    const msg = JSON.parse(message);

    // find a handler for this type of message.
    const handler = handlers[msg.type];

    // if the handler exists, execute it.
    if (handler) handler(socket, msg);
  });

  // remove the socket when it disconnects
  socket.on("disconnect", () => sockets.splice(sockets.indexOf(socket), 1));
});

// Game master loop.  This loop is where the server pairs up players for a game.
setInterval(() => {
  // if there are two available players, start a game.
  if (lounge.length >= 2) {
    // this object contains the state of the game between these two players
    const game = {
      id: cuid(),
      players: [lounge.shift(), lounge.shift()],
      completed: 0
    };

    // add the game to the list of games
    games.push(game);

    // notify each player to start playing
    game.players.forEach(player => {
      player.activeGame = game;
      player.send({ type: "start" });
    });
  }
}, 1000); // one second
