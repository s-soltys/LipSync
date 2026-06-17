package scenes
{
	import avatar3D.AvatarAnimator;
	import avatar3D.AvatarBuilder;
	import avatar3D.expression.ExpressionsCollection;
	import away3d.animators.*;
	import away3d.cameras.*;
	import away3d.containers.*;
	import away3d.core.utils.*;
	import away3d.events.*;
	import away3d.loaders.*;
	import away3d.materials.*;
	import away3d.primitives.*;
	import flash.display.*;
	import flash.events.*;
	import flash.net.URLLoader;
	import flash.net.URLRequest;
	import flash.utils.*;
	import generic3D.AvatarScene;
	import generic3D.collada.AvatarModelProvider;
	
	
	[SWF(backgroundColor="#000000", frameRate="20", quality="LOW", width="800", height="800")]
	public class SetupVisemeScene extends Sprite {
		private var avatarScene:AvatarScene;
		private var modelProvider:AvatarModelProvider;
		private var avatar:AvatarAnimator;
		
		private var pos:Number;
		
		public function SetupVisemeScene(){
			Debug.active = true;
			
			avatarScene = new AvatarScene();
			this.addChild(avatarScene);
			
			modelProvider = new AvatarModelProvider();
			modelProvider.addEventListener(Event.COMPLETE, onComplete);
			modelProvider.readModel();
		}
		
		
		private function onComplete(e:Event):void {
			var avatarBuilder:AvatarBuilder = new AvatarBuilder(modelProvider.getModel());
			avatar = avatarBuilder.buildAvatar();
			
			avatarScene.addAvatar(avatar);
			
			avatar.getAvatarObject3D().moveTo(0, -25, 0);
			avatarScene.camera.moveTo( -50, 50, -50);
			//avatarScene.camera.lookAt(avatar.getAvatarObject3D().position);
			
			avatar.getAvatarObject3D().rotationY += 15;
			
			onLoadXML(null);
			
			addRefresh();
			
			addEventListener(Event.ENTER_FRAME, onEnterFrame);
		}
		
		private function onEnterFrame(event:Event):void {
			//avatar.getAvatarObject3D().rotationY += 1;
			
			avatar.lookAt(this.mouseX, this.mouseY);
		}
		
		
		
		private function addRefresh():void {
			var timer:Timer = new Timer(1000);
			timer.addEventListener(TimerEvent.TIMER, reloadExpressions);
			timer.start();
		}
		
		private function reloadExpressions(e:Event):void {
			var loader:URLLoader = new URLLoader();
			loader.addEventListener(Event.COMPLETE, onLoadXML);
			loader.load(new URLRequest("../lib/xml/avatar_default.xml"));
		}
		
		private function onLoadXML(e:Event):void {
			if (e != null) {
				var xml:XML = new XML(e.target.data);
				ExpressionsCollection.initCollection(xml.expressions);
			}
			
			for (var i:int = 0; i < 10; i++)
				//avatar.setViseme(ExpressionsCollection.JOY, 1.0);
				avatar.setViseme(ExpressionsCollection.getVisemeByAlias("v7"), 1.0);
				
		}
		
	}
}