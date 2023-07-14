import { CharacterNetworkClientUpdate } from "@mml-playground/character-network";
import { AnimationState } from "@mml-playground/character-network/src";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoadingManager,
  Object3D,
  Quaternion,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { Character } from "./Character";

export class RemoteController {
  public characterModel: Object3D | null = null;
  private loadManager: LoadingManager = new LoadingManager();

  private animationMixer: AnimationMixer = new AnimationMixer(new Object3D());
  private animations = new Map<AnimationState, AnimationAction>();
  public currentAnimation: AnimationState = AnimationState.idle;

  private fbxLoader: FBXLoader = new FBXLoader(this.loadManager);
  private gltfLoader: GLTFLoader = new GLTFLoader(this.loadManager);

  constructor(public readonly character: Character, public readonly id: number) {
    this.characterModel = this.character.model!.mesh!;
    this.animationMixer = new AnimationMixer(this.characterModel);
  }

  public update(clientUpdate: CharacterNetworkClientUpdate, time: number, deltaTime: number): void {
    if (!this.character) return;
    this.character.update(time);
    this.updateFromNetwork(clientUpdate);
    this.animationMixer.update(deltaTime);
  }

  public setAnimationFromFile(animationType: AnimationState, fileName: string): void {
    const animationFile = `${fileName}`;
    const extension = fileName.split(".").pop();
    if (typeof extension !== "string") {
      console.error(`Error: could not recognize extension of animation: ${animationFile}`);
      return;
    }
    if (["gltf", "glb"].includes(extension)) {
      this.gltfLoader.load(
        animationFile,
        (anim) => {
          const animation = anim.animations[0] as AnimationClip;
          const animationAction = this.animationMixer.clipAction(animation);
          this.animations.set(animationType, animationAction);
          if (animationType === AnimationState.idle) {
            animationAction.play();
          }
        },
        undefined,
        (error) => console.error(`Error loading ${animationFile}: ${error}`),
      );
    } else if (["fbx"].includes(extension)) {
      this.fbxLoader.load(
        animationFile,
        (anim) => {
          const animation = anim.animations[0] as AnimationClip;
          const animationAction = this.animationMixer.clipAction(animation);
          this.animations.set(animationType, animationAction);
          if (animationType === AnimationState.idle) {
            animationAction.play();
          }
        },
        undefined,
        (error) => console.error(`Error loading ${animationFile}: ${error}`),
      );
    }
  }

  private transitionToAnimation(
    targetAnimation: AnimationState,
    transitionDuration: number = 0.21,
  ): void {
    if (this.currentAnimation === targetAnimation) return;

    const currentAction = this.animations.get(this.currentAnimation);
    const targetAction = this.animations.get(targetAnimation);

    if (!targetAction) return;

    if (currentAction) {
      currentAction.enabled = true;
      targetAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(transitionDuration)
        .play();
      currentAction.crossFadeTo(targetAction, transitionDuration, true);
    } else {
      targetAction.play();
    }

    this.currentAnimation = targetAnimation;
  }

  private updateFromNetwork(clientUpdate: CharacterNetworkClientUpdate): void {
    if (!this.characterModel) return;
    const { location, rotation, state } = clientUpdate;
    this.characterModel.position.x = location.x;
    this.characterModel.position.y = location.y;
    this.characterModel.position.z = location.z;
    const rotationQuaternion = new Quaternion(0, rotation.quaternionY, 0, rotation.quaternionW);
    this.characterModel.setRotationFromQuaternion(rotationQuaternion);
    if (state !== this.currentAnimation) {
      this.transitionToAnimation(state);
    }
  }
}
