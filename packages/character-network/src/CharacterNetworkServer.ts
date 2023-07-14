import WebSocket from "ws";

import {
  AnimationState,
  CharacterNetworkClientUpdate,
  CharacterNetworkCodec,
} from "./CharacterNetworkCodec";

export type TClient = {
  socket: WebSocket;
  update: CharacterNetworkClientUpdate;
};

export class CharacterNetworkServer {
  private clients: Map<number, TClient> = new Map();
  private clientLastPong: Map<number, number> = new Map();

  private nextId: number = 1;
  private recycledIds: number[] = [];

  constructor() {
    setInterval(this.sendPlayerUpdates.bind(this), 33);
    setInterval(this.pingClients.bind(this), 5000);
    setInterval(this.heartBeat.bind(this), 10000);
  }

  private getId(): number {
    return this.nextId++;
  }

  private disposeId(id: number): void {
    this.recycledIds.push(id);
  }

  private heartBeat() {
    const now = Date.now();
    this.clientLastPong.forEach((clientLastPong, id) => {
      if (now - clientLastPong > 10000) {
        this.clients.delete(id);
        this.disposeId(id);
        this.clientLastPong.delete(id);
        const disconnectMessage = JSON.stringify({ id, disconnect: true });
        for (const { socket: otherSocket } of this.clients.values()) {
          if (otherSocket.readyState === WebSocket.OPEN) {
            otherSocket.send(disconnectMessage);
          }
        }
      }
    });
  }

  private pingClients() {
    this.clients.forEach((client) => {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({ type: "ping" }));
      }
    });
  }

  public connectClient(socket: WebSocket) {
    const id = this.getId();

    const connectMessage = JSON.stringify({ id, connected: true });
    socket.send(connectMessage);
    for (const { socket: otherSocket } of this.clients.values()) {
      if (otherSocket.readyState === WebSocket.OPEN) {
        otherSocket.send(connectMessage);
      }
    }

    for (const { update } of this.clients.values()) {
      socket.send(CharacterNetworkCodec.encodeUpdate(update));
    }

    this.clients.set(id, {
      socket: socket,
      update: {
        id,
        location: { x: 0, y: 0, z: 0 },
        rotation: { quaternionY: 0, quaternionW: 0 },
        state: AnimationState.idle,
      },
    });

    socket.on("message", (message: WebSocket.Data, _isBinary: boolean) => {
      let update;

      if (message instanceof Buffer) {
        const arrayBuffer = new Uint8Array(message).buffer;
        update = CharacterNetworkCodec.decodeUpdate(arrayBuffer);
      } else {
        try {
          const data = JSON.parse(message as string);
          if (data.type === "pong") {
            this.clientLastPong.set(data.id, Date.now());
          }
        } catch (e) {
          console.log("Error parsing JSON message", message, e);
        }

        return;
      }

      if (update) {
        update.id = id;
        if (this.clients.get(id) !== undefined) {
          this.clients.get(id)!.update = update;

          for (const { socket: otherSocket } of this.clients.values()) {
            if (otherSocket !== socket && otherSocket.readyState === WebSocket.OPEN) {
              otherSocket.send(message);
            }
          }
        }
      }
    });

    socket.on("close", () => {
      this.clients.delete(id);
      this.disposeId(id);
      const disconnectMessage = JSON.stringify({ id, disconnect: true });
      for (const { socket: otherSocket } of this.clients.values()) {
        if (otherSocket.readyState === WebSocket.OPEN) {
          otherSocket.send(disconnectMessage);
        }
      }
    });
  }

  private sendPlayerUpdates(): void {
    const updates: CharacterNetworkClientUpdate[] = [];
    this.clients.forEach((client) => {
      updates.push(client.update);
    });

    for (const update of updates) {
      const encodedUpdate = CharacterNetworkCodec.encodeUpdate(update);
      this.clients.forEach((client) => {
        client.socket.send(encodedUpdate);
      });
    }
  }
}
