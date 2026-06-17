package avatar3D.core
{
	/**
	 * ...
	 * @author S
	 */
	
	public interface BoneParameter {
		function set value(value:Number):void;
		function get value():Number;
		
		function refreshValue(change:Number):void;
		
		function setValueTween(value:Number, time:Number, delay:Number = 0.0, transition:String = "linear"):void;
		
	}
	
}