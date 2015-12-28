package editor {
	import avatar3D.AvatarAnimator;
	import avatar3D.AvatarBuilder;
	import flash.display.Bitmap;
	import flash.display.BitmapData;
	import flash.display.Sprite;
	import flash.events.Event;
	import flash.filters.BlurFilter;
	import flash.filters.GlowFilter;
	import flash.geom.Matrix;
	import flash.geom.Rectangle;
	import generic3D.AvatarScene;
	import generic3D.collada.AvatarModelProvider;
	import util.Label;
	import lipsync.core.network.NeuralNetwork;
	import util.NeuralNetworkProvider;
	/**
	 * ...
	 * @author S
	 */
	
	[SWF(backgroundColor="#ffffff", frameRate="18", quality="LOW", width="500", height="700")]
	public class LipsyncEditorWindow extends Sprite {
		private var avatarScene:AvatarScene;
		private var modelProvider:AvatarModelProvider;
		
		private var currentAvatar:AvatarAnimator;
		private var avatarMale:AvatarAnimator;
		private var avatarFemale:AvatarAnimator;
		
		private var magnify:Bitmap;
		
		public static const MALE:String = "MALE";
		public static const FEMALE:String = "FEMALE";
		public var sex:String = FEMALE;
		
		private var voiceNN:NeuralNetwork;
		private var voiceUrl:String = "../lib/final/female/";
		
		
		public function LipsyncEditorWindow() {
			avatarScene = new AvatarScene();
			this.addChild(avatarScene);
			avatarScene.scaleX = avatarScene.scaleY = 1.2;
			avatarScene.y = -80;
			avatarScene.x = -70;
			avatarScene.camera.moveTo( -50, 50, -50);
			
			modelProvider = new AvatarModelProvider(FEMALE);
			modelProvider.addEventListener(Event.COMPLETE, onCompleteFemale);
			modelProvider.readModel();
			
			addEventListener(Event.ENTER_FRAME, onEnterFrame);
			
			createForeground();
			createLinks();
			
			magnify = new Bitmap();
			magnify.bitmapData = new BitmapData(420, 260);
			this.addChild(magnify);
			magnify.filters = [new BlurFilter(3, 3), new GlowFilter(0x000000, 0.5, 20, 20)];
			magnify.x = 50;
			magnify.y = 380;
		}
		
		private function onCompleteFemale(e:Event):void {
			var avatarBuilder:AvatarBuilder = new AvatarBuilder(modelProvider.getModel());
			avatarFemale = avatarBuilder.buildAvatar();
			
			avatarFemale.getAvatarObject3D().moveTo(0, -25, 0);
			avatarFemale.getAvatarObject3D().rotationY += 15;
			avatarFemale.getAvatarObject3D().rotationX -= 5;
			avatarFemale.getAvatarObject3D().rotationZ += 5;
			
			if (sex == FEMALE)
				avatarScene.addAvatar(avatarFemale);
			
			modelProvider = new AvatarModelProvider(MALE);
			modelProvider.addEventListener(Event.COMPLETE, onCompleteMale);
			modelProvider.readModel();
		}
		private function onCompleteMale(e:Event):void {
			var avatarBuilder:AvatarBuilder = new AvatarBuilder(modelProvider.getModel());
			avatarMale = avatarBuilder.buildAvatar();
			
			avatarMale.getAvatarObject3D().moveTo(0, -25, 0);
			avatarMale.getAvatarObject3D().rotationY += 15;
			avatarMale.getAvatarObject3D().rotationX -= 5;
			avatarMale.getAvatarObject3D().rotationZ += 5;
			
			if (sex == MALE) {
				avatarScene.addAvatar(avatarMale);
				currentAvatar = avatarMale;
				voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageMale);
			} else {
				currentAvatar = avatarFemale;
				voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageFemale);
			}
			
		}
		
		public function changeSex():void {
			if (currentAvatar == avatarFemale) {
				sex = MALE;
				voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageMale);
				voiceUrl = "../lib/final/male/";
				currentAvatar = avatarMale;
				avatarScene.addAvatar(avatarMale);
				avatarScene.removeAvatar(avatarFemale);
			} else if (currentAvatar == avatarMale) {
				sex = FEMALE;
				voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageFemale);
				voiceUrl = "../lib/final/female/";
				currentAvatar = avatarFemale;
				avatarScene.addAvatar(avatarFemale);
				avatarScene.removeAvatar(avatarMale);
			}
		}
		
		private function onEnterFrame(event:Event):void {
			drawMagnify();
			currentAvatar.lookAt(this.mouseX * 0.5 + 250, this.mouseY * 0.5 + 250);
		}
		
		private function createForeground():void {
			var s:Sprite = new Sprite();
			s.graphics.beginFill(0xffffff);
			s.graphics.drawRect(0, 0, 500, 300);
			s.graphics.endFill();
			
			this.addChild(s);
			s.x = 80;
			s.y = 350;
		}
		
		private function drawMagnify():void {
			var m:Matrix = new Matrix();
			m.translate( -245, -230);
			m.scale(3.5, 3.5);
			magnify.bitmapData.draw(this, m, null, null, new Rectangle(0, 0, 420, 260));
		}
		
		private function createLinks():void {
			var link:Label;
			
			link = createChangeSex("AWATAR");
			link.y = 20;
			this.addChild(link);
			
			link = createLink("aeiou", "aeiou.mp3");
			link.y = 80;
			this.addChild(link);
			
			link = createLink("count", "count.mp3");
			link.y = 110;
			this.addChild(link);
			
			link = createLink("example", "example.mp3");
			link.y = 140;
			this.addChild(link);
			
			link = createLink("lipsync", "lipsync.mp3");
			link.y = 170;
			this.addChild(link);
			
			link = createLink("speech", "speech.mp3");
			link.y = 200;
			this.addChild(link);
			
		}
		
		private function createLink(text:String, url:String):Label {
			var label:Label = new Label(text);
			label.x = 30;
			label.onMouseClick(createLinkAction(url));
			return label;
		}
		
		private function createLinkAction(file:String):Function {
			return function(e:Event):void {
				currentAvatar.saySentencesUsingNetwork([voiceUrl + file], voiceNN);
				currentAvatar.lookAt(360, 180);
			};
		}
		
		private function createChangeSex(text:String):Label {
			var label:Label = new Label(text);
			label.x = 20;
			label.onMouseClick(function(e:Event):void { changeSex(); } );
			return label;
		}
		
		
	}
}