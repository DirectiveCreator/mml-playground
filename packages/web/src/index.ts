import "./style.css";

import { CharacterNetworkClient } from "@mml-playground/character-network";
import {
  CameraManager,
  CharacterDescription,
  CharacterManager,
  Composer,
  CoreMMLScene,
  KeyInputManager,
  RunTimeManager,
  CollisionsManager,
} from "@mml-playground/core";
import { AudioListener, Fog, Group, PerspectiveCamera, Scene } from "three";

import { Environment } from "./environment";
import { Lights } from "./lights";
import { Room } from "./room";

export class App {
  private readonly group: Group;
  private readonly scene: Scene;
  private readonly audioListener: AudioListener;

  private readonly camera: PerspectiveCamera;
  private readonly runTime: RunTimeManager;
  private readonly inputManager: KeyInputManager;
  private readonly characterManager: CharacterManager;
  private readonly cameraManager: CameraManager;
  private readonly composer: Composer;
  private readonly networkClient: CharacterNetworkClient;

  private readonly collisionsManager: CollisionsManager;
  private readonly modelsPath: string = "/assets/models";
  private readonly characterDescription: CharacterDescription | null = null;

  constructor() {
    this.scene = new Scene();
    this.scene.fog = new Fog(0xdcdcdc, 0.1, 100);
    this.audioListener = new AudioListener();
    this.group = new Group();

    this.runTime = new RunTimeManager();
    this.inputManager = new KeyInputManager();
    this.cameraManager = new CameraManager();
    this.camera = this.cameraManager.camera;
    this.composer = new Composer(this.scene, this.camera);
    this.networkClient = new CharacterNetworkClient();
    this.collisionsManager = new CollisionsManager(this.scene);
    this.characterManager = new CharacterManager(
      this.collisionsManager,
      this.cameraManager,
      this.runTime,
      this.inputManager,
      this.networkClient,
    );
    this.group.add(this.characterManager.group);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    const mmlScene = new CoreMMLScene(
      this.composer.renderer,
      this.scene,
      this.camera,
      this.audioListener,
      this.collisionsManager,
      () => {
        return this.characterManager.getLocalCharacterPositionAndRotation();
      },
      `${protocol}//${host}/document`,
    );
    this.group.add(mmlScene.group);

    const environment = new Environment(this.scene, this.composer.renderer);
    this.group.add(environment);
    const room = new Room();
    this.collisionsManager.addMeshesGroup(room);
    this.group.add(room);
    this.group.add(new Lights());

    this.scene.add(this.group);

    this.characterDescription = {
      meshFileUrl: `${this.modelsPath}/unreal_idle.glb`,
      idleAnimationFileUrl: `${this.modelsPath}/unreal_idle.glb`,
      jogAnimationFileUrl: `${this.modelsPath}/unreal_jog.glb`,
      sprintAnimationFileUrl: `${this.modelsPath}/unreal_run.glb`,
      modelScale: 1.0,
    };
  }

  async init() {
    this.scene.add(this.group);

    document.addEventListener("mousedown", () => {
      if (this.audioListener.context.state === "suspended") {
        this.audioListener.context.resume();
      }
    });

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.networkClient.connection
      .connect(`${protocol}//${host}/network`)
      .then(() => {
        this.characterManager.spawnCharacter(
          this.characterDescription!,
          this.networkClient.connection.clientId!,
          this.group,
          true,
        );
      })
      .catch(() => {
        this.characterManager.spawnCharacter(this.characterDescription!, 0, this.group, true);
      });
  }

  public update(): void {
    this.runTime.update();
    this.characterManager.update();
    this.cameraManager.update();
    this.composer.render(this.runTime.time);
    requestAnimationFrame(() => {
      this.update();
    });
  }
}

const app = new App();
app.init();
app.update();
