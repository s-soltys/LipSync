package avatar3D.core
{
	import avatar3D.core.bone.BoneRot;
	import avatar3D.core.bone.BoneMov;
	import avatar3D.core.BoneParameter;
	import avatar3D.expression.ExpressionsCollection;
	import avatar3D.expression.setting.ExpressionParameter;
	import away3d.containers.Bone;
	import away3d.containers.ObjectContainer3D;
	import away3d.core.base.Object3D;
	import util.AvatarDebugger;
	
	/**
	 * ...
	 * @author S
	 */
	public class AvatarFeature
	{
		public var rotX:BoneParameter;
		public var rotY:BoneParameter;
		public var rotZ:BoneParameter;
		
		public var movX:BoneParameter;
		public var movY:BoneParameter;
		public var movZ:BoneParameter;
		
		
		public function AvatarFeature(avatar:ObjectContainer3D, parameter:XMLList) {
			var boneName:String = parameter.@name;
			var bone:Bone = avatar.getBoneByName(boneName);
			
			if (bone) {
				rotX = new BoneRot(bone, parameter.rot_X);
				rotY = new BoneRot(bone, parameter.rot_Y);
				rotZ = new BoneRot(bone, parameter.rot_Z);
				
				movX = new BoneMov(bone, parameter.mov_X);
				movY = new BoneMov(bone, parameter.mov_Y);
				movZ = new BoneMov(bone, parameter.mov_Z);
				
				AvatarDebugger.log("avatar bone " + boneName + " created.");
			} else {
				AvatarDebugger.error("avatar bone " + boneName + " not present");
			}
		}
		
		public function setParameter(value:Number, parameter:ExpressionParameter):void {
			if (parameter.rotation == true) {
				rotX.value = value * parameter.rot_x;
				rotY.value = value * parameter.rot_y;
				rotZ.value = value * parameter.rot_z;
			}
			
			if (parameter.movement == true) {
				movX.value = value * parameter.mov_x;
				movY.value = value * parameter.mov_y;
				movZ.value = value * parameter.mov_z;
			}
		}
		
		public function setParameterTween(value:Number, parameter:ExpressionParameter, time:Number):void {
			if (parameter.rotation == true) {
				rotX.setValueTween(value * parameter.rot_x, time);
				rotY.setValueTween(value * parameter.rot_y, time);
				rotZ.setValueTween(value * parameter.rot_z, time);
			}
			
			if (parameter.movement == true) {
				movX.setValueTween(value * parameter.mov_x, time);
				movY.setValueTween(value * parameter.mov_y, time);
				movZ.setValueTween(value * parameter.mov_z, time);
			}
		}
		
	}
}