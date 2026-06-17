package generic3D.collada 
{
	import away3d.containers.ObjectContainer3D;
	import away3d.core.base.Object3D;
	import away3d.core.utils.Cast;
	import away3d.events.ParserEvent;
	import away3d.loaders.Collada;
	import away3d.materials.BitmapMaterial;
	import flash.events.Event;
	import flash.events.EventDispatcher;
	import flash.utils.ByteArray;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarModelProvider extends EventDispatcher
	{
		[Embed(source = "../../../lib/model/eye.jpg")]
		private var eye_texture:Class;
		
		[Embed(source = "../../../lib/model/teeth.jpg")]
		private var teeth_texture:Class;
		
		[Embed(source = "../../../lib/model/texture_m.jpg")] private var model_texture_m:Class;
		[Embed(source = "../../../lib/model/texture.jpg")] private var model_texture_f:Class;
		
		[Embed(source = "../../../lib/model/model.dae", mimeType = "application/octet-stream")]	private var model_f:Class;
		[Embed(source = "../../../lib/model/model_man.dae", mimeType = "application/octet-stream")]	private var model_m:Class;
		
		private var modelMaterial:BitmapMaterial;
		private var eyeMaterial:BitmapMaterial;
		private var teethMaterial:BitmapMaterial;
		
		private var colladaParser:Collada;
		private var avatarModel:ObjectContainer3D;
		
		
		public static const MALE:String = "MALE";
		public static const FEMALE:String = "FEMALE";
		public var sex:String = MALE;
		
		public function AvatarModelProvider(sex:String = FEMALE) {
			this.sex = sex;
		}
		
		public function readModel():void {
			if (sex == MALE) modelMaterial = new BitmapMaterial(Cast.bitmap(model_texture_m));
			else if (sex == FEMALE) modelMaterial = new BitmapMaterial(Cast.bitmap(model_texture_f));
			
			eyeMaterial = new BitmapMaterial(Cast.bitmap(eye_texture));
			teethMaterial = new BitmapMaterial(Cast.bitmap(teeth_texture));
			
			colladaParser = new Collada();
			colladaParser.scaling = 10.5;
			colladaParser.addEventListener(ParserEvent.PARSE_SUCCESS, onParseCollada);
			
			var modelByteArray:ByteArray;
			if (sex == MALE) modelByteArray = new model_m;
			else if (sex == FEMALE) modelByteArray = new model_f;
			
			colladaParser.parseGeometry(modelByteArray);
		}
		
		private function onParseCollada(event:ParserEvent):void {
			avatarModel = (colladaParser.container as ObjectContainer3D);
			
			if (sex == MALE) avatarModel.materialLibrary.getMaterial("texture_jpg").material = modelMaterial;
			else if(sex == FEMALE) avatarModel.materialLibrary.getMaterial("texture_jpg").material = modelMaterial;
			
			avatarModel.materialLibrary.getMaterial("eye_jpg").material = eyeMaterial;
			avatarModel.materialLibrary.getMaterial("teeth_jpg_001").material = teethMaterial;
			
			setupObjectBones(avatarModel.children);
			
			dispatchEvent(new Event(Event.COMPLETE));
		}
		
		private function setupObjectBones(model:Object):void {
			for each(var obj:Object in model) {
				obj.rotationX = obj.rotationX;
				
				try {
					var array:Vector.<Object3D> = obj.children;
					setupObjectBones(array);
				} catch (e:Error) { }
			}
		}
		
		public function getModel():ObjectContainer3D {
			return avatarModel;
		}
		
	}
}