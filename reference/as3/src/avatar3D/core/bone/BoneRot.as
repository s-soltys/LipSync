package avatar3D.core.bone 
{
	import avatar3D.core.BoneParameter;
	import away3d.containers.Bone;
	import caurina.transitions.Tweener;
	/**
	 * ...
	 * @author S
	 */
	public class BoneRot implements BoneParameter
	{
		private var bone:Bone;
		
		private var min:Number;
		private var def:Number;
		private var max:Number;
		
		private var currentWeight:Number;
		private var nextWeight:Number;
		
		
		public function BoneRot(bone:Bone, xml:XMLList) {
			this.bone = bone;
			
			if (xml.length() > 0) {
				this.def = xml.@def;
				this.min = xml.@min;
				this.max = xml.@max;
				
				this.currentWeight = xml.@inertia;
				this.nextWeight = 1.0 - this.currentWeight;
				
				bone.rotationX = def;
			} else {
				def = max = min = bone.rotationX;
				this.currentWeight = 0.0;
				this.nextWeight = 1.0;
			}
		}
		
		
		public function set value(value:Number):void {
			bone.rotationX *= currentWeight;
			
			if (value > 0) {
				if (value > 1.0) value = 1.0;
				
				bone.rotationX += nextWeight * (def + max * value);
			} else if (value < 0) {
				value = -value;
				if (value > 1.0) value = 1.0;
				
				bone.rotationX += nextWeight * (def + min * value);
			} else {
				bone.rotationX += nextWeight * def;
			}
		}
		
		public function get value():Number {
			return bone.rotationX;
		}
		
		
		public function refreshValue(change:Number):void {
			bone.rotationX *= (nextWeight * change + currentWeight);
		}
		
		public function setValueTween(value:Number, time:Number, delay:Number = 0.0, transition:String = "linear"):void {
			var target:Number = 0.0;
			if (value > 0) {
				if (value > 1.0) value = 1.0;
				
				target = def + max * value;
			} else if (value < 0) {
				value = -value;
				if (value > 1.0) value = 1.0;
				
				target = def + min * value;
			} else {
				target = def;
			}
			
			Tweener.addTween(bone, { rotationX:target, time:time, delay:delay, transition:transition } );
		}
		
	}
}